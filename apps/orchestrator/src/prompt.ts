import { Effect } from "effect";
import type { GhAdapter } from "./gh-adapter.ts";
import { read_manifest, type Slice } from "./manifest.ts";
import type { IssueRef, SliceId } from "./state.ts";

export type SliceHint = "dag" | "linear" | "single";

export interface PRD {
	readonly spec_version: number;
	readonly intent: string;
	readonly acceptance: ReadonlyArray<string>;
	readonly constraints: ReadonlyArray<string>;
	readonly slice_hint: SliceHint;
	readonly body: string;
}

const strip_quotes = (s: string) => s.replace(/^["']|["']$/g, "").trim();

interface FrontmatterAccumulator {
	spec_version: number;
	intent: string;
	slice_hint: SliceHint;
	acceptance: string[];
	constraints: string[];
}

const empty_acc = (): FrontmatterAccumulator => ({
	spec_version: 0,
	intent: "",
	slice_hint: "single",
	acceptance: [],
	constraints: [],
});

const find_frontmatter_end = (lines: ReadonlyArray<string>): number => {
	if (lines[0]?.trim() !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") return i;
	}
	return -1;
};

const apply_kv = (
	acc: FrontmatterAccumulator,
	pair: { readonly key: string; readonly val: string },
): string[] | null => {
	const { key, val } = pair;
	if (key === "spec_version") {
		acc.spec_version = Number(val);
		return null;
	}
	if (key === "intent") {
		acc.intent = val;
		return null;
	}
	if (key === "slice_hint") {
		if (val === "dag" || val === "linear" || val === "single") acc.slice_hint = val;
		return null;
	}
	if (key === "acceptance") return acc.acceptance;
	if (key === "constraints") return acc.constraints;
	return null;
};

const parse_frontmatter = (lines: ReadonlyArray<string>): FrontmatterAccumulator => {
	const acc = empty_acc();
	let current_list: string[] | null = null;
	for (const raw of lines) {
		const kv = raw.match(/^(\w+):\s*(.*)$/);
		if (kv) {
			current_list = apply_kv(acc, { key: kv[1] ?? "", val: strip_quotes(kv[2] ?? "") });
			continue;
		}
		const item = raw.match(/^\s+-\s*(.*)$/);
		if (item && current_list) current_list.push(strip_quotes(item[1] ?? ""));
	}
	return acc;
};

export const parse_prd = (issue_body: string): PRD | null => {
	const lines = issue_body.split("\n");
	const end_idx = find_frontmatter_end(lines);
	if (end_idx === -1) return null;
	const acc = parse_frontmatter(lines.slice(1, end_idx));
	return {
		spec_version: acc.spec_version,
		intent: acc.intent,
		acceptance: acc.acceptance,
		constraints: acc.constraints,
		slice_hint: acc.slice_hint,
		body: lines.slice(end_idx + 1).join("\n"),
	};
};

export const assemble_prompt = (issue: IssueRef, prd: PRD): string => {
	const lines = [
		`# ${issue.identifier}: ${issue.title}`,
		"",
		`Intent: ${prd.intent}`,
		"",
		"## Acceptance",
		...prd.acceptance.map((a) => `- ${a}`),
		"",
		"## Constraints",
		...prd.constraints.map((c) => `- ${c}`),
		"",
		`Slice strategy: ${prd.slice_hint}`,
		"",
		"---",
		"",
		prd.body,
	];
	return lines.join("\n");
};

export class InvalidSpec extends Error {
	readonly _tag = "InvalidSpec";
	constructor(
		readonly issue_id: string,
		readonly reason: string,
	) {
		super(`invalid spec on ${issue_id}: ${reason}`);
	}
}

export const read_parent_prd = (gh: GhAdapter, issue: IssueRef): Effect.Effect<PRD | null> =>
	Effect.gen(function* () {
		const body = yield* gh.fetch_body(issue.id).pipe(Effect.catchAll(() => Effect.succeed("")));
		const prd = parse_prd(body);
		if (!prd || prd.spec_version !== 1) return null;
		return prd;
	});

export const make_prompt_for =
	(gh: GhAdapter) =>
	(issue: IssueRef, worktree_path: string): Effect.Effect<string> =>
		Effect.gen(function* () {
			const body = yield* gh.fetch_body(issue.id).pipe(Effect.catchAll(() => Effect.succeed("")));
			const prd = parse_prd(body);
			if (!prd || prd.spec_version !== 1) {
				return `# ${issue.identifier}: ${issue.title}\n\n${body || "(no body)"}`;
			}
			if (prd.slice_hint === "dag" || prd.slice_hint === "linear") {
				const manifest = yield* read_manifest(worktree_path).pipe(
					Effect.catchAll(() => Effect.succeed(null)),
				);
				if (!manifest) return assemble_planner_prompt(issue, prd);
			}
			return assemble_prompt(issue, prd);
		});

export const assemble_planner_prompt = (issue: IssueRef, prd: PRD): string => {
	const lines = [
		`# Parent: ${issue.identifier} ${issue.title}`,
		"",
		`Intent: ${prd.intent}`,
		"",
		"## Acceptance",
		...prd.acceptance.map((a) => `- ${a}`),
		"",
		"## Constraints",
		...prd.constraints.map((c) => `- ${c}`),
		"",
		"---",
		"",
		"## Your job: PLANNER",
		"You are the planner for this work. Decompose this PRD into a DAG of small,",
		"independently-shippable slices. Write the manifest to `.specs/slices.yaml`",
		"and commit it on this branch.",
		"",
		"Manifest schema:",
		"```yaml",
		"slices:",
		"  - id: <kebab-case, ^[a-z0-9-]{1,32}$>",
		"    title: <short imperative>",
		"    deps: [<sibling ids>]",
		"    prompt_extra: <slice-specific guidance, optional>",
		"```",
		"",
		"Constraints on the DAG:",
		"  - Each slice should be small enough to ship as one PR.",
		"  - Slice ids are unique and stable.",
		"  - Deps form a DAG (no cycles).",
		"  - Prefer linear chains unless work is genuinely parallel.",
		"",
		"After committing the manifest, exit. The orchestrator will dispatch one",
		"worker per slice when its deps are merged.",
	];
	return lines.join("\n");
};

export interface DepHistory {
	readonly id: SliceId;
	readonly title: string;
	readonly pr_number: number | null;
}

export interface SlicePromptArgs {
	readonly parent: IssueRef;
	readonly prd: PRD;
	readonly slice: Slice;
	readonly done_deps: ReadonlyArray<DepHistory>;
	readonly parent_branch: string;
}

export const assemble_slice_prompt = (args: SlicePromptArgs): string => {
	const { parent, prd, slice, done_deps, parent_branch } = args;
	const dep_lines =
		done_deps.length > 0
			? done_deps.map(
					(d) => `- ${d.id} (${d.title})${d.pr_number ? ` — PR #${d.pr_number} merged` : ""}`,
				)
			: ["- (none — this slice has no dependencies)"];
	const slice_deps = slice.deps.length > 0 ? slice.deps.join(", ") : "(none)";
	const extra = slice.prompt_extra.trim();
	const lines = [
		`# Parent: ${parent.identifier} ${parent.title}`,
		"",
		`Intent: ${prd.intent}`,
		"",
		"## Acceptance",
		...prd.acceptance.map((a) => `- ${a}`),
		"",
		"## Constraints",
		...prd.constraints.map((c) => `- ${c}`),
		"",
		"---",
		"",
		`## Your slice: ${slice.id} — ${slice.title}`,
		`Depends on: ${slice_deps}`,
		"",
		extra || "(no slice-specific instructions; stay strictly within this slice's scope)",
		"",
		"## Done in earlier slices",
		...dep_lines,
		"",
		"## Steer the boat",
		"Before opening your PR, re-read .specs/slices.yaml. If what you learned",
		"changes downstream work, update the manifest and include those changes",
		"in your PR. Rules:",
		"  - Only modify slices still :open.",
		"  - You may add new slices or remove unused :open ones.",
		"  - Do NOT touch :in-progress or :done.",
		"",
		"## Terminal action",
		`Open PR titled "[slice:${slice.id}] ${slice.title}" targeting branch ${parent_branch}.`,
	];
	return lines.join("\n");
};
