/**
 * End-to-end harness test for the orchestrator engine.
 *
 * Drives the real make_engine() through planner -> slice -> merge -> terminate,
 * mocking only the system boundaries (worker.ts, worktree.ts) and stubbing
 * GhAdapter in-memory. manifest.ts reads/writes a real tempdir.
 *
 * mock.module() must run BEFORE engine.ts is imported, so the engine import
 * is deferred to a top-level await after registration.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import type { GhAdapter, PrStatus } from "./gh-adapter.ts";
import { NotFound } from "./gh-adapter.ts";
import { MANIFEST_PATH, read_manifest } from "./manifest.ts";
import { assemble_planner_prompt, assemble_prompt, parse_prd } from "./prompt.ts";
import {
	ALIGNED_LABEL,
	IN_PROGRESS_LABEL,
	type IssueId,
	type IssueRef,
	type Outcome,
	ROUTING_LABEL,
	type WorkerId,
	worker_label,
} from "./state.ts";
import type { WorkerExit, WorkerHandle, WorkerSpawnRequest } from "./worker.ts";
import type { WorktreeConfig, WorktreeRef } from "./worktree.ts";

/* -------------------------------------------------------------------------- */
/* Module-scoped harness state — closed over by the mock factories.           */
/* -------------------------------------------------------------------------- */

interface SpawnRecord {
	readonly req: WorkerSpawnRequest;
	readonly is_planner: boolean;
}

interface ExitController {
	resolve: (exit: WorkerExit) => void;
	promise: Promise<WorkerExit>;
}

interface Harness {
	temp_root: string;
	worktree_root: string;
	repo_root: string;
	spawn_calls: SpawnRecord[];
	exit_controllers: ExitController[];
	written_manifests: Map<string, string>;
	commit_calls: Array<{ wt: WorktreeRef; files: ReadonlyArray<string>; message: string }>;
	leaked_timers: Set<unknown>;
	original_set_timeout: typeof setTimeout;
}

const harness: Harness = {
	temp_root: "",
	worktree_root: "",
	repo_root: "",
	spawn_calls: [],
	exit_controllers: [],
	written_manifests: new Map(),
	commit_calls: [],
	leaked_timers: new Set(),
	original_set_timeout: globalThis.setTimeout,
};

const SLICES_YAML_3 = `slices:
  - id: schema
    title: Define schema
    deps: []
    prompt_extra: ""
  - id: api
    title: Build API
    deps: [schema]
    prompt_extra: ""
  - id: ui
    title: Build UI
    deps: [api]
    prompt_extra: ""
`;

/* -------------------------------------------------------------------------- */
/* mock.module — worker.ts                                                    */
/* -------------------------------------------------------------------------- */

mock.module("./worker.ts", () => ({
	spawn_worker: (req: WorkerSpawnRequest): Effect.Effect<WorkerHandle, never> =>
		Effect.sync(() => {
			const is_planner = req.prompt.includes("Your job: PLANNER");
			harness.spawn_calls.push({ req, is_planner });

			// Planner: synchronously write the manifest into the worktree so the
			// retry-driven re-dispatch finds it on disk. Slice workers are no-ops.
			if (is_planner) {
				const target_dir = join(req.worktree_path, ".specs");
				mkdirSync(target_dir, { recursive: true });
				const manifest_path = join(req.worktree_path, MANIFEST_PATH);
				const yaml = harness.written_manifests.get(req.worktree_path) ?? SLICES_YAML_3;
				writeFileSync(manifest_path, yaml);
			}

			let resolver: (exit: WorkerExit) => void = () => undefined;
			const promise = new Promise<WorkerExit>((r) => {
				resolver = r;
			});
			harness.exit_controllers.push({ resolve: resolver, promise });

			const session_id = `sess-${harness.spawn_calls.length}-0` as `${string}-${string}`;
			const handle: WorkerHandle = {
				pid: harness.spawn_calls.length,
				session_id,
				worker_id: req.worker_id,
				kill: () => Effect.void,
				wait: () =>
					Effect.tryPromise({
						try: () => promise,
						catch: (): WorkerExit => ({ _tag: "Abnormal", code: -1, signal: null }),
					}).pipe(Effect.catchAll((e) => Effect.succeed(e as WorkerExit))),
			};
			return handle;
		}),
}));

/* -------------------------------------------------------------------------- */
/* mock.module — worktree.ts                                                  */
/* -------------------------------------------------------------------------- */

const slugify_for_branch = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40) || "issue";

mock.module("./worktree.ts", () => ({
	branch_for: (issue: IssueRef) => `auto/issue-${issue.id}-${slugify_for_branch(issue.title)}`,
	ensure_worktree: (_cfg: WorktreeConfig, issue: IssueRef): Effect.Effect<WorktreeRef, never> =>
		Effect.sync(() => {
			const slug = `issue-${issue.id}-${slugify_for_branch(issue.title)}`;
			const path = mkdtempSync(join(harness.worktree_root, `${slug}-`));
			return { path, branch: `auto/${slug}` };
		}),
	ensure_worktree_at: (args: {
		readonly cfg: WorktreeConfig;
		readonly path: string;
		readonly branch: string;
		readonly base_branch: string;
	}): Effect.Effect<WorktreeRef, never> =>
		Effect.sync(() => {
			mkdirSync(args.path, { recursive: true });
			return { path: args.path, branch: args.branch };
		}),
	remove_worktree: (_cfg: WorktreeConfig, _wt: WorktreeRef): Effect.Effect<void, never> =>
		Effect.void,
	pull_ff: (_wt: WorktreeRef): Effect.Effect<void, never> => Effect.void,
	commit_and_push_files: (req: {
		readonly wt: WorktreeRef;
		readonly files: ReadonlyArray<string>;
		readonly message: string;
	}): Effect.Effect<void, never> =>
		Effect.sync(() => {
			harness.commit_calls.push({ wt: req.wt, files: req.files, message: req.message });
		}),
	slice_worktree_path: (args: {
		readonly cfg: WorktreeConfig;
		readonly parent_slug: string;
		readonly slice_id: string;
	}) => join(args.cfg.worktree_root, `${args.parent_slug}__slice-${args.slice_id}`),
	default_config: (repo_root: string): WorktreeConfig => ({
		repo_root,
		base_branch: "main",
		worktree_root: join(repo_root, "worktrees"),
	}),
}));

/* -------------------------------------------------------------------------- */
/* engine import (must come AFTER mock.module registrations)                  */
/* -------------------------------------------------------------------------- */

const { make_engine } = await import("./engine.ts");
const { make_store } = await import("./store.ts");

/* -------------------------------------------------------------------------- */
/* In-memory GhAdapter stub                                                   */
/* -------------------------------------------------------------------------- */

interface StubIssue {
	id: IssueId;
	identifier: string;
	title: string;
	state: "open" | "closed";
	body: string;
	labels: Set<string>;
}

interface GhCallLog {
	claims: IssueId[];
	releases: Array<{ id: IssueId; outcome: Outcome | null }>;
	comments: Array<{ id: IssueId; body: string }>;
	closes: IssueId[];
	set_slice_label_calls: Array<{ id: IssueId; slice_id: string; from: string | null; to: string }>;
}

interface GhStubArgs {
	readonly issues: Map<IssueId, StubIssue>;
	readonly pr_responses: Map<string, PrStatus | null>;
	readonly log: GhCallLog;
	readonly self_worker: WorkerId;
}

const make_gh_stub = (args: GhStubArgs): GhAdapter => {
	const { issues, pr_responses, log, self_worker } = args;
	const view_one = (id: IssueId): IssueRef | null => {
		const i = issues.get(id);
		if (!i) return null;
		return {
			id: i.id,
			identifier: i.identifier,
			title: i.title,
			state: i.state,
			labels: new Set(i.labels),
		};
	};

	return {
		fetch_candidates: () =>
			Effect.sync(() => {
				const out: IssueRef[] = [];
				for (const i of issues.values()) {
					if (i.state !== "open") continue;
					if (!i.labels.has(ALIGNED_LABEL)) continue;
					const ref = view_one(i.id);
					if (ref) out.push(ref);
				}
				return out;
			}),
		claim: (id: IssueId, worker: WorkerId) =>
			Effect.sync(() => {
				log.claims.push(id);
				const i = issues.get(id);
				if (!i) return;
				i.labels.delete(ROUTING_LABEL.local);
				i.labels.delete(ROUTING_LABEL.cloud);
				i.labels.add(IN_PROGRESS_LABEL);
				i.labels.add(worker_label(worker));
			}),
		release: (id: IssueId, outcome: Outcome | null) =>
			Effect.sync(() => {
				log.releases.push({ id, outcome });
				const i = issues.get(id);
				if (!i) return;
				i.labels.delete(IN_PROGRESS_LABEL);
				i.labels.delete(worker_label(self_worker));
				if (outcome) i.labels.add(outcome);
			}),
		view: (id: IssueId) => {
			const ref = view_one(id);
			if (!ref) return Effect.fail(new NotFound(id));
			return Effect.succeed(ref);
		},
		fetch_body: (id: IssueId) => {
			const i = issues.get(id);
			if (!i) return Effect.fail(new NotFound(id));
			return Effect.succeed(i.body);
		},
		find_pr_by_branch: (branch: string) => Effect.sync(() => pr_responses.get(branch) ?? null),
		comment: (id: IssueId, body: string) =>
			Effect.sync(() => {
				log.comments.push({ id, body });
			}),
		close: (id: IssueId) =>
			Effect.sync(() => {
				log.closes.push(id);
				const i = issues.get(id);
				if (i) i.state = "closed";
			}),
		set_slice_label: (req) =>
			Effect.sync(() => {
				log.set_slice_label_calls.push({
					id: req.issue,
					slice_id: req.slice_id,
					from: req.from,
					to: req.to,
				});
				const i = issues.get(req.issue);
				if (!i) return;
				if (req.from) i.labels.delete(`slice:${req.slice_id}:${req.from}`);
				i.labels.add(`slice:${req.slice_id}:${req.to}`);
			}),
	} satisfies GhAdapter;
};

/* -------------------------------------------------------------------------- */
/* Test helpers                                                               */
/* -------------------------------------------------------------------------- */

const make_prd_body = (slice_hint: "single" | "dag"): string =>
	`---
spec_version: 1
intent: build a thing
slice_hint: ${slice_hint}
acceptance:
  - thing works
constraints:
  - no breakage
---
body
`;

interface MakeIssueArgs {
	readonly id: string;
	readonly title: string;
	readonly slice_hint: "single" | "dag";
}

const make_issue = (args: MakeIssueArgs): StubIssue => ({
	id: args.id as IssueId,
	identifier: `ORG-${args.id}`,
	title: args.title,
	state: "open",
	body: make_prd_body(args.slice_hint),
	labels: new Set<string>([ALIGNED_LABEL, ROUTING_LABEL.local]),
});

interface FixtureBundle {
	readonly engine: ReturnType<typeof make_engine>;
	readonly issues: Map<IssueId, StubIssue>;
	readonly pr_responses: Map<string, PrStatus | null>;
	readonly log: GhCallLog;
	readonly worktree_cfg: WorktreeConfig;
}

const setup_engine = async (initial_issues: StubIssue[]): Promise<FixtureBundle> => {
	const issues = new Map<IssueId, StubIssue>();
	for (const i of initial_issues) issues.set(i.id, i);
	const pr_responses = new Map<string, PrStatus | null>();
	const log: GhCallLog = {
		claims: [],
		releases: [],
		comments: [],
		closes: [],
		set_slice_label_calls: [],
	};
	const self_worker = "wkr-1" as WorkerId;
	const gh = make_gh_stub({ issues, pr_responses, log, self_worker });

	const snapshot_path = join(harness.temp_root, "state.json");
	const store = await Effect.runPromise(make_store(snapshot_path));

	const worktree_cfg: WorktreeConfig = {
		repo_root: harness.repo_root,
		base_branch: "main",
		worktree_root: harness.worktree_root,
	};

	const prompt_for = (issue: IssueRef, worktree_path: string): Effect.Effect<string> =>
		Effect.gen(function* () {
			const body = yield* gh.fetch_body(issue.id).pipe(Effect.catchAll(() => Effect.succeed("")));
			const prd = parse_prd(body);
			if (!prd || prd.spec_version !== 1) {
				return `# ${issue.identifier}: ${issue.title}\n\n${body}`;
			}
			if (prd.slice_hint === "dag" || prd.slice_hint === "linear") {
				const m = yield* read_manifest(worktree_path).pipe(
					Effect.catchAll(() => Effect.succeed(null)),
				);
				if (!m) return assemble_planner_prompt(issue, prd);
			}
			return assemble_prompt(issue, prd);
		});

	const engine = make_engine({
		store,
		gh,
		cfg: {
			backend: "local",
			poll_interval_ms: 999_999,
			max_concurrent: 4,
			stall_timeout_ms: 999_999,
		},
		self_worker,
		worktree_cfg,
		prompt_for,
	});

	return { engine, issues, pr_responses, log, worktree_cfg };
};

const flush_async = async (ms: number = 25): Promise<void> => {
	await new Promise((r) => harness.original_set_timeout(r, ms));
};

// Resolve the most recently-spawned worker as Normal exit, then let the
// scheduled-by-engine fire-and-forget watch_exit / watch_slice_exit settle.
const finish_last_worker_normal = async (): Promise<void> => {
	const ctrl = harness.exit_controllers[harness.exit_controllers.length - 1];
	if (!ctrl) return;
	ctrl.resolve({ _tag: "Normal", code: 0 });
	await flush_async();
};

/* -------------------------------------------------------------------------- */
/* Lifecycle: timer-leak isolation + fresh tempdir per test                    */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
	harness.temp_root = mkdtempSync(join(tmpdir(), "pier-engine-it-"));
	harness.repo_root = harness.temp_root;
	harness.worktree_root = join(harness.temp_root, "worktrees");
	mkdirSync(harness.worktree_root, { recursive: true });
	harness.spawn_calls = [];
	harness.exit_controllers = [];
	harness.written_manifests = new Map();
	harness.commit_calls = [];
	harness.leaked_timers = new Set();
	harness.original_set_timeout = globalThis.setTimeout;

	// Capture every setTimeout the engine creates so we can clear them in
	// afterEach. The engine's terminate() does NOT clear retry timers; that's
	// a known gap that would otherwise leak across tests.
	const original = harness.original_set_timeout;
	const patched = ((cb: () => void, delay?: number) => {
		const handle = original(() => {
			harness.leaked_timers.delete(handle);
			cb();
		}, delay);
		harness.leaked_timers.add(handle);
		return handle;
	}) as typeof setTimeout;
	(globalThis as { setTimeout: typeof setTimeout }).setTimeout = patched;
});

afterEach(() => {
	for (const t of harness.leaked_timers) clearTimeout(t as NodeJS.Timeout);
	harness.leaked_timers.clear();
	(globalThis as { setTimeout: typeof setTimeout }).setTimeout = harness.original_set_timeout;
	try {
		rmSync(harness.temp_root, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("engine integration — full lifecycle", () => {
	test("single-shot: claim + planner spawn, then merged-PR -> terminate(done)", async () => {
		const issue = make_issue({ id: "100", title: "Single Shot", slice_hint: "single" });
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll);

		expect(fx.log.claims).toEqual([issue.id]);
		expect(harness.spawn_calls.length).toBe(1);
		const first = harness.spawn_calls[0];
		expect(first?.is_planner).toBe(false); // single-shot prompt is the regular prompt
		expect(issue.labels.has(IN_PROGRESS_LABEL)).toBe(true);
		expect(issue.labels.has(worker_label("wkr-1" as WorkerId))).toBe(true);
		expect(fx.log.closes.length).toBe(0);
		expect(fx.log.releases.length).toBe(0);

		// Worker exits Normal — schedules a continuation retry but the next
		// poll's reconcile path terminates first.
		await finish_last_worker_normal();

		// Queue a merged parent PR.
		const parent_branch = `auto/issue-${issue.id}-single-shot`;
		fx.pr_responses.set(parent_branch, { number: 1, state: "MERGED", merged: true });

		await Effect.runPromise(fx.engine.poll);
		await flush_async();

		expect(fx.log.closes).toEqual([]); // close is reserved for slice-mode all-done
		expect(fx.log.releases.length).toBe(1);
		expect(fx.log.releases[0]?.outcome).toBe("done");
		expect(issue.labels.has(IN_PROGRESS_LABEL)).toBe(false);
	});

	test("slice mode (dag): planner -> 3 slices in dep order -> close + release(done)", async () => {
		const issue = make_issue({ id: "200", title: "Slice Parent", slice_hint: "dag" });
		const fx = await setup_engine([issue]);

		// Tick 1: planner spawn; mock writes slices.yaml synchronously.
		await Effect.runPromise(fx.engine.poll);

		expect(fx.log.claims).toEqual([issue.id]);
		expect(harness.spawn_calls.length).toBe(1);
		expect(harness.spawn_calls[0]?.is_planner).toBe(true);
		const planner_wt = harness.spawn_calls[0]?.req.worktree_path;
		expect(planner_wt).toBeTruthy();
		const manifest_text = readFileSync(join(planner_wt as string, MANIFEST_PATH), "utf8");
		expect(manifest_text).toContain("schema");
		expect(manifest_text).toContain("api");
		expect(manifest_text).toContain("ui");

		// Planner exits Normal -> watch_exit schedules a retry. We won't wait
		// for it — the next poll's reconcile_slice_aware handles dispatch.
		await finish_last_worker_normal();

		// Tick 2: reconcile seeds slice labels and dispatches `schema`.
		await Effect.runPromise(fx.engine.poll);

		expect(harness.spawn_calls.length).toBe(2);
		expect(harness.spawn_calls[1]?.is_planner).toBe(false);
		expect(issue.labels.has("slice:schema:in-progress")).toBe(true);
		expect(issue.labels.has("slice:api:open")).toBe(true);
		expect(issue.labels.has("slice:ui:open")).toBe(true);

		// Slice worker exits Normal (no retry — slice exits don't schedule retries).
		await finish_last_worker_normal();

		// Mark schema PR merged. Tick 3: schema -> done; api dispatched.
		const parent_branch = `auto/issue-${issue.id}-slice-parent`;
		fx.pr_responses.set(`${parent_branch}/slice-schema`, {
			number: 10,
			state: "MERGED",
			merged: true,
		});
		await Effect.runPromise(fx.engine.poll);

		expect(issue.labels.has("slice:schema:done")).toBe(true);
		expect(issue.labels.has("slice:api:in-progress")).toBe(true);
		expect(harness.spawn_calls.length).toBe(3);

		await finish_last_worker_normal();

		// Tick 4: api -> done; ui dispatched.
		fx.pr_responses.set(`${parent_branch}/slice-api`, {
			number: 11,
			state: "MERGED",
			merged: true,
		});
		await Effect.runPromise(fx.engine.poll);

		expect(issue.labels.has("slice:api:done")).toBe(true);
		expect(issue.labels.has("slice:ui:in-progress")).toBe(true);
		expect(harness.spawn_calls.length).toBe(4);

		await finish_last_worker_normal();

		// Tick 5: ui -> done; all-done -> close + terminate(done).
		fx.pr_responses.set(`${parent_branch}/slice-ui`, {
			number: 12,
			state: "MERGED",
			merged: true,
		});
		await Effect.runPromise(fx.engine.poll);
		await flush_async();

		expect(issue.labels.has("slice:ui:done")).toBe(true);
		expect(fx.log.closes).toEqual([issue.id]);
		expect(fx.log.releases.length).toBe(1);
		expect(fx.log.releases[0]?.outcome).toBe("done");
	});

	test("slice mode: never spawns more than max_concurrent slices in flight", async () => {
		const issue = make_issue({ id: "201", title: "Slice Parent Linear", slice_hint: "dag" });
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll); // planner
		await finish_last_worker_normal();
		await Effect.runPromise(fx.engine.poll); // dispatch schema

		// Second consecutive poll without merging schema must NOT dispatch api
		// (has_in_flight_slice gate).
		await Effect.runPromise(fx.engine.poll);
		expect(harness.spawn_calls.length).toBe(2); // planner + schema only
	});

	test("seed_missing_slice_labels writes one :open label per slice", async () => {
		const issue = make_issue({ id: "202", title: "Seeds", slice_hint: "dag" });
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll); // planner
		await finish_last_worker_normal();
		await Effect.runPromise(fx.engine.poll); // reconcile seeds + dispatches schema

		const seed_calls = fx.log.set_slice_label_calls.filter(
			(c) => c.from === null && c.to === "open",
		);
		const ids = new Set(seed_calls.map((c) => c.slice_id));
		expect(ids).toEqual(new Set(["schema", "api", "ui"]));
	});

	test("manifest revert: editing a :done slice's title triggers revert + comment", async () => {
		const issue = make_issue({ id: "300", title: "Revert Parent", slice_hint: "dag" });
		const fx = await setup_engine([issue]);

		// Planner.
		await Effect.runPromise(fx.engine.poll);
		const parent_wt_path = harness.spawn_calls[0]?.req.worktree_path as string;
		await finish_last_worker_normal();

		// Dispatch schema; merge schema (-> :done).
		await Effect.runPromise(fx.engine.poll);
		await finish_last_worker_normal();
		const parent_branch = `auto/issue-${issue.id}-revert-parent`;
		fx.pr_responses.set(`${parent_branch}/slice-schema`, {
			number: 20,
			state: "MERGED",
			merged: true,
		});
		// Tick: schema -> done; dispatch api.
		await Effect.runPromise(fx.engine.poll);
		expect(issue.labels.has("slice:schema:done")).toBe(true);
		expect(issue.labels.has("slice:api:in-progress")).toBe(true);

		// Tamper with the parent worktree's manifest: change schema's title.
		// (This simulates the api PR illegally editing a locked slice.)
		const tampered = `slices:
  - id: schema
    title: TAMPERED
    deps: []
    prompt_extra: ""
  - id: api
    title: Build API
    deps: [schema]
    prompt_extra: ""
  - id: ui
    title: Build UI
    deps: [api]
    prompt_extra: ""
`;
		writeFileSync(join(parent_wt_path, MANIFEST_PATH), tampered);

		// Finish api worker; merge api PR; the next poll triggers
		// validate_and_revert_manifest because api flips :in-progress -> :done.
		await finish_last_worker_normal();
		fx.pr_responses.set(`${parent_branch}/slice-api`, {
			number: 21,
			state: "MERGED",
			merged: true,
		});

		const comments_before = fx.log.comments.length;
		const commits_before = harness.commit_calls.length;

		await Effect.runPromise(fx.engine.poll);
		await flush_async();

		expect(harness.commit_calls.length).toBe(commits_before + 1);
		expect(harness.commit_calls[commits_before]?.files).toEqual([MANIFEST_PATH]);

		const new_comments = fx.log.comments.slice(comments_before);
		expect(new_comments.length).toBeGreaterThanOrEqual(1);
		const revert_comment = new_comments.find((c) => c.body.includes("modified-locked"));
		expect(revert_comment).toBeDefined();
		expect(revert_comment?.body).toContain("schema");

		// On-disk manifest restored.
		const restored = readFileSync(join(parent_wt_path, MANIFEST_PATH), "utf8");
		expect(restored).toContain("Define schema");
		expect(restored).not.toContain("TAMPERED");
	});

	test("manifest revert: snapshot is updated so a follow-up clean tick does not re-comment", async () => {
		const issue = make_issue({ id: "301", title: "Revert Snapshot", slice_hint: "dag" });
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll);
		const parent_wt_path = harness.spawn_calls[0]?.req.worktree_path as string;
		await finish_last_worker_normal();
		await Effect.runPromise(fx.engine.poll); // dispatch schema
		await finish_last_worker_normal();
		const parent_branch = `auto/issue-${issue.id}-revert-snapshot`;
		fx.pr_responses.set(`${parent_branch}/slice-schema`, {
			number: 30,
			state: "MERGED",
			merged: true,
		});
		await Effect.runPromise(fx.engine.poll); // schema -> done; api dispatched

		const tampered = `slices:
  - id: schema
    title: TAMPERED2
    deps: []
    prompt_extra: ""
  - id: api
    title: Build API
    deps: [schema]
    prompt_extra: ""
  - id: ui
    title: Build UI
    deps: [api]
    prompt_extra: ""
`;
		writeFileSync(join(parent_wt_path, MANIFEST_PATH), tampered);
		await finish_last_worker_normal();
		fx.pr_responses.set(`${parent_branch}/slice-api`, {
			number: 31,
			state: "MERGED",
			merged: true,
		});
		await Effect.runPromise(fx.engine.poll); // revert + comment; api -> done; ui dispatched
		await flush_async();

		const comments_after_first_revert = fx.log.comments.length;

		// Second clean tick: ui still in-progress, no PR merged yet, no
		// manifest change. validate_and_revert_manifest must not fire.
		await Effect.runPromise(fx.engine.poll);
		await flush_async();

		expect(fx.log.comments.length).toBe(comments_after_first_revert);
	});

	test("ineligible candidate is skipped (no claim)", async () => {
		const issue = make_issue({ id: "400", title: "No Aligned", slice_hint: "single" });
		issue.labels.delete(ALIGNED_LABEL);
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll);

		expect(fx.log.claims).toEqual([]);
		expect(harness.spawn_calls.length).toBe(0);
	});

	test("issue closed mid-flight -> reconcile terminates with rejected", async () => {
		const issue = make_issue({ id: "500", title: "Goes Closed", slice_hint: "single" });
		const fx = await setup_engine([issue]);

		await Effect.runPromise(fx.engine.poll);
		expect(harness.spawn_calls.length).toBe(1);
		await finish_last_worker_normal();

		// User closes the issue out-of-band.
		issue.state = "closed";
		await Effect.runPromise(fx.engine.poll);
		await flush_async();

		expect(fx.log.releases.length).toBe(1);
		expect(fx.log.releases[0]?.outcome).toBe("rejected");
	});
});
