import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
	type ClaimContended,
	type GhAdapter,
	GhError,
	NotFound,
	type PrStatus,
} from "./gh-adapter.ts";
import type { Slice } from "./manifest.ts";
import {
	assemble_planner_prompt,
	assemble_prompt,
	assemble_slice_prompt,
	make_prompt_for,
	type PRD,
	parse_prd,
	read_parent_prd,
} from "./prompt.ts";
import type { IssueId, IssueRef, Outcome, RoutingLabel, SliceId, WorkerId } from "./state.ts";

const make_issue = (overrides: Partial<IssueRef> = {}): IssueRef => ({
	id: "42" as IssueId,
	identifier: "PIER-42",
	title: "Make pier shiny",
	state: "open",
	labels: new Set<string>(),
	...overrides,
});

const make_prd = (overrides: Partial<PRD> = {}): PRD => ({
	spec_version: 1,
	intent: "Ship feature X",
	acceptance: ["Acceptance one", "Acceptance two"],
	constraints: ["Constraint one"],
	slice_hint: "single",
	body: "Detailed body content",
	...overrides,
});

const make_slice = (overrides: Partial<Slice> = {}): Slice => ({
	id: "slice-a" as SliceId,
	title: "Build slice A",
	deps: [],
	prompt_extra: "",
	...overrides,
});

interface StubArgs {
	readonly body?: string;
	readonly body_error?: GhError | NotFound;
}

const make_stub_gh = (args: StubArgs = {}): GhAdapter => ({
	fetch_candidates: (_filter: { readonly aligned: true; readonly routing: RoutingLabel }) =>
		Effect.succeed([] as ReadonlyArray<IssueRef>),
	claim: (_issue: IssueId, _worker: WorkerId): Effect.Effect<void, GhError | ClaimContended> =>
		Effect.succeed(undefined),
	release: (_issue: IssueId, _outcome: Outcome | null): Effect.Effect<void, GhError> =>
		Effect.succeed(undefined),
	view: (issue: IssueId): Effect.Effect<IssueRef, GhError | NotFound> =>
		Effect.succeed(make_issue({ id: issue })),
	fetch_body: (_issue: IssueId): Effect.Effect<string, GhError | NotFound> =>
		args.body_error ? Effect.fail(args.body_error) : Effect.succeed(args.body ?? ""),
	find_pr_by_branch: (_branch: string): Effect.Effect<PrStatus | null, GhError> =>
		Effect.succeed(null),
	comment: (_issue: IssueId, _body: string): Effect.Effect<void, GhError> =>
		Effect.succeed(undefined),
	close: (_issue: IssueId): Effect.Effect<void, GhError> => Effect.succeed(undefined),
	set_slice_label: (_req: {
		readonly issue: IssueId;
		readonly slice_id: string;
		readonly from: string | null;
		readonly to: string;
	}): Effect.Effect<void, GhError> => Effect.succeed(undefined),
});

describe("parse_prd", () => {
	test("parses full front-matter with all fields", () => {
		const body = [
			"---",
			"spec_version: 1",
			'intent: "Build a thing"',
			"slice_hint: dag",
			"acceptance:",
			"  - First criterion",
			'  - "Second criterion"',
			"constraints:",
			"  - Use TypeScript",
			"---",
			"Body line one",
			"Body line two",
		].join("\n");
		const prd = parse_prd(body);
		expect(prd).not.toBeNull();
		if (!prd) throw new Error("expected prd");
		expect(prd.spec_version).toBe(1);
		expect(prd.intent).toBe("Build a thing");
		expect(prd.slice_hint).toBe("dag");
		expect(prd.acceptance).toEqual(["First criterion", "Second criterion"]);
		expect(prd.constraints).toEqual(["Use TypeScript"]);
		expect(prd.body).toBe("Body line one\nBody line two");
	});

	test("returns null when no front-matter delimiter", () => {
		expect(parse_prd("just plain text\nno fences here")).toBeNull();
	});

	test("returns null when front-matter is unterminated", () => {
		const body = ["---", "spec_version: 1", "intent: foo", "more body"].join("\n");
		expect(parse_prd(body)).toBeNull();
	});

	test("partial front-matter: missing acceptance and constraints lists", () => {
		const body = ["---", "spec_version: 1", "intent: Solo intent", "---", "body"].join("\n");
		const prd = parse_prd(body);
		expect(prd).not.toBeNull();
		if (!prd) throw new Error("expected prd");
		expect(prd.acceptance).toEqual([]);
		expect(prd.constraints).toEqual([]);
		expect(prd.slice_hint).toBe("single");
		expect(prd.body).toBe("body");
	});

	test("invalid slice_hint falls back to default 'single'", () => {
		const body = ["---", "spec_version: 1", "intent: x", "slice_hint: galaxy", "---", "body"].join(
			"\n",
		);
		const prd = parse_prd(body);
		expect(prd).not.toBeNull();
		if (!prd) throw new Error("expected prd");
		expect(prd.slice_hint).toBe("single");
	});

	test("body extraction preserves multi-line content after closing fence", () => {
		const body = ["---", "spec_version: 1", "intent: hi", "---", "line a", "", "line c"].join("\n");
		const prd = parse_prd(body);
		expect(prd).not.toBeNull();
		if (!prd) throw new Error("expected prd");
		expect(prd.body).toBe("line a\n\nline c");
	});

	test("front-matter with empty body produces empty body string", () => {
		const body = ["---", "spec_version: 1", "intent: hi", "---"].join("\n");
		const prd = parse_prd(body);
		expect(prd).not.toBeNull();
		if (!prd) throw new Error("expected prd");
		expect(prd.body).toBe("");
	});
});

describe("assemble_prompt", () => {
	test("renders title, intent, acceptance, constraints, slice strategy, and body", () => {
		const issue = make_issue({ identifier: "PIER-7", title: "Do work" });
		const prd = make_prd({
			intent: "Make X work",
			acceptance: ["A1", "A2"],
			constraints: ["C1"],
			slice_hint: "linear",
			body: "BODY-CONTENT",
		});
		const out = assemble_prompt(issue, prd);
		expect(out).toContain("# PIER-7: Do work");
		expect(out).toContain("Intent: Make X work");
		expect(out).toContain("## Acceptance");
		expect(out).toContain("- A1");
		expect(out).toContain("- A2");
		expect(out).toContain("## Constraints");
		expect(out).toContain("- C1");
		expect(out).toContain("Slice strategy: linear");
		expect(out).toContain("BODY-CONTENT");
		expect(out.indexOf("## Acceptance")).toBeLessThan(out.indexOf("## Constraints"));
		expect(out.indexOf("## Constraints")).toBeLessThan(out.indexOf("BODY-CONTENT"));
	});
});

describe("assemble_planner_prompt", () => {
	test("includes parent header, intent, planner instructions, and manifest schema example", () => {
		const issue = make_issue({ identifier: "PIER-9", title: "Big parent" });
		const prd = make_prd({ intent: "Decompose me", slice_hint: "dag" });
		const out = assemble_planner_prompt(issue, prd);
		expect(out).toContain("# Parent: PIER-9 Big parent");
		expect(out).toContain("Intent: Decompose me");
		expect(out).toContain("## Your job: PLANNER");
		expect(out).toContain(".specs/slices.yaml");
		expect(out).toContain("```yaml");
		expect(out).toContain("slices:");
		expect(out).toContain("- id: <kebab-case, ^[a-z0-9-]{1,32}$>");
		expect(out).toContain("deps: [<sibling ids>]");
		expect(out).toContain("Constraints on the DAG:");
	});
});

describe("assemble_slice_prompt", () => {
	test("renders parent header, slice block, prompt_extra, dep history with PR numbers, terminal action", () => {
		const out = assemble_slice_prompt({
			parent: make_issue({ identifier: "PIER-10", title: "Parent A" }),
			prd: make_prd({ intent: "Parent intent" }),
			slice: make_slice({
				id: "slice-b" as SliceId,
				title: "Build B",
				deps: ["slice-a" as SliceId],
				prompt_extra: "Stick to module foo",
			}),
			done_deps: [
				{ id: "slice-a" as SliceId, title: "Build A", pr_number: 123 },
				{ id: "slice-zero" as SliceId, title: "Bootstrap", pr_number: null },
			],
			parent_branch: "feat/parent-a",
		});
		expect(out).toContain("# Parent: PIER-10 Parent A");
		expect(out).toContain("Intent: Parent intent");
		expect(out).toContain("## Your slice: slice-b — Build B");
		expect(out).toContain("Depends on: slice-a");
		expect(out).toContain("Stick to module foo");
		expect(out).toContain("## Done in earlier slices");
		expect(out).toContain("- slice-a (Build A) — PR #123 merged");
		expect(out).toContain("- slice-zero (Bootstrap)");
		expect(out).not.toContain("- slice-zero (Bootstrap) — PR");
		expect(out).toContain("## Steer the boat");
		expect(out).toContain("Only modify slices still :open");
		expect(out).toContain("## Terminal action");
		expect(out).toContain(
			'Open PR titled "[slice:slice-b] Build B" targeting branch feat/parent-a.',
		);
	});

	test("falls back to '(none)' dep block and default extra when slice has no deps or extra", () => {
		const out = assemble_slice_prompt({
			parent: make_issue(),
			prd: make_prd(),
			slice: make_slice({ id: "solo" as SliceId, title: "Solo", deps: [], prompt_extra: "  " }),
			done_deps: [],
			parent_branch: "main",
		});
		expect(out).toContain("Depends on: (none)");
		expect(out).toContain("- (none — this slice has no dependencies)");
		expect(out).toContain(
			"(no slice-specific instructions; stay strictly within this slice's scope)",
		);
		expect(out).toContain('Open PR titled "[slice:solo] Solo" targeting branch main.');
	});
});

describe("read_parent_prd", () => {
	test("returns parsed PRD on valid spec_version", async () => {
		const body = ["---", "spec_version: 1", "intent: ok", "slice_hint: single", "---", "body"].join(
			"\n",
		);
		const gh = make_stub_gh({ body });
		const prd = await Effect.runPromise(read_parent_prd(gh, make_issue()));
		expect(prd).not.toBeNull();
		expect(prd?.intent).toBe("ok");
	});

	test("returns null when fetch_body fails", async () => {
		const gh = make_stub_gh({ body_error: new GhError("view", "boom") });
		const prd = await Effect.runPromise(read_parent_prd(gh, make_issue()));
		expect(prd).toBeNull();
	});

	test("returns null when spec_version is not 1", async () => {
		const body = ["---", "spec_version: 2", "intent: ok", "---", "body"].join("\n");
		const gh = make_stub_gh({ body });
		const prd = await Effect.runPromise(read_parent_prd(gh, make_issue()));
		expect(prd).toBeNull();
	});

	test("returns null when no front-matter", async () => {
		const gh = make_stub_gh({ body: "no fences here" });
		const prd = await Effect.runPromise(read_parent_prd(gh, make_issue()));
		expect(prd).toBeNull();
	});
});

describe("make_prompt_for", () => {
	test("empty body fallback when fetch_body errors", async () => {
		const gh = make_stub_gh({ body_error: new NotFound("42" as IssueId) });
		const out = await Effect.runPromise(
			make_prompt_for(gh)(make_issue({ identifier: "PIER-1", title: "T" }), "/tmp/nope"),
		);
		expect(out).toBe("# PIER-1: T\n\n(no body)");
	});

	test("invalid spec_version falls back to title + raw body (raw, not parsed)", async () => {
		const body = ["---", "spec_version: 9", "intent: ignored", "---", "raw body"].join("\n");
		const gh = make_stub_gh({ body });
		const out = await Effect.runPromise(
			make_prompt_for(gh)(make_issue({ identifier: "PIER-2", title: "Two" }), "/tmp/nope"),
		);
		// Fallback echoes the entire raw body, not the parsed body.
		expect(out).toBe(`# PIER-2: Two\n\n${body}`);
	});

	test("body without front-matter returns title + raw body fallback", async () => {
		const gh = make_stub_gh({ body: "plain content" });
		const out = await Effect.runPromise(
			make_prompt_for(gh)(make_issue({ identifier: "PIER-3", title: "Three" }), "/tmp/nope"),
		);
		expect(out).toBe("# PIER-3: Three\n\nplain content");
	});

	test("slice_hint=dag with no manifest returns planner prompt", async () => {
		const body = [
			"---",
			"spec_version: 1",
			"intent: decompose me",
			"slice_hint: dag",
			"---",
			"body",
		].join("\n");
		const gh = make_stub_gh({ body });
		// Use a path that does not exist so read_manifest returns null.
		const tmp = mkdtempSync(join(tmpdir(), "prompt-test-no-manifest-"));
		try {
			const out = await Effect.runPromise(
				make_prompt_for(gh)(make_issue({ identifier: "PIER-4", title: "Big" }), tmp),
			);
			expect(out).toContain("## Your job: PLANNER");
			expect(out).toContain("# Parent: PIER-4 Big");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("slice_hint=single returns the original PRD prompt", async () => {
		const body = [
			"---",
			"spec_version: 1",
			"intent: solo",
			"slice_hint: single",
			"acceptance:",
			"  - one",
			"---",
			"BODY",
		].join("\n");
		const gh = make_stub_gh({ body });
		const out = await Effect.runPromise(
			make_prompt_for(gh)(make_issue({ identifier: "PIER-5", title: "Solo" }), "/tmp/nope"),
		);
		expect(out).toContain("# PIER-5: Solo");
		expect(out).toContain("Slice strategy: single");
		expect(out).toContain("BODY");
		expect(out).not.toContain("## Your job: PLANNER");
	});

	test("slice_hint=dag with manifest present returns the original PRD prompt (not planner)", async () => {
		const body = [
			"---",
			"spec_version: 1",
			"intent: decompose me",
			"slice_hint: dag",
			"acceptance:",
			"  - one",
			"---",
			"BODY",
		].join("\n");
		const gh = make_stub_gh({ body });
		const tmp = mkdtempSync(join(tmpdir(), "prompt-test-with-manifest-"));
		try {
			mkdirSync(join(tmp, ".specs"), { recursive: true });
			writeFileSync(
				join(tmp, ".specs", "slices.yaml"),
				["slices:", "  - id: slice-a", "    title: First slice", "    deps: []", ""].join("\n"),
			);
			const out = await Effect.runPromise(
				make_prompt_for(gh)(make_issue({ identifier: "PIER-6", title: "Big" }), tmp),
			);
			expect(out).toContain("# PIER-6: Big");
			expect(out).toContain("Slice strategy: dag");
			expect(out).toContain("BODY");
			expect(out).not.toContain("## Your job: PLANNER");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
