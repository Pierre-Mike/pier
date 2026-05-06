import { Effect } from "effect";
import { type DispatchConfig, dispatch_gate_ok, eligible_for_dispatch } from "./dispatcher.ts";
import type { GhAdapter } from "./gh-adapter.ts";
import {
	apply_revert,
	diff_manifests,
	MANIFEST_PATH,
	type Manifest,
	read_manifest,
	type Slice,
	validate_diff,
	write_manifest,
} from "./manifest.ts";
import { assemble_slice_prompt, type DepHistory, type PRD, read_parent_prd } from "./prompt.ts";
import {
	collect_dep_history,
	derive_slice_states,
	parent_termination,
	ready_slices,
	slice_branch_for,
} from "./slice_engine.ts";
import {
	CONTINUATION_DELAY_MS,
	failure_backoff,
	IN_PROGRESS_LABEL,
	type IssueId,
	type IssueRef,
	type Outcome,
	type RetryEntry,
	ROUTING_LABEL,
	type RunningEntry,
	type SliceId,
	type SliceState,
	slice_label,
	type WorkerId,
} from "./state.ts";
import type { Store } from "./store.ts";
import { spawn_worker, type WorkerHandle } from "./worker.ts";
import {
	branch_for,
	commit_and_push_files,
	ensure_worktree,
	ensure_worktree_at,
	pull_ff,
	remove_worktree,
	slice_worktree_path,
	type WorktreeConfig,
	type WorktreeRef,
} from "./worktree.ts";

export interface EngineDeps {
	readonly store: Store;
	readonly gh: GhAdapter;
	readonly cfg: DispatchConfig;
	readonly self_worker: WorkerId;
	readonly worktree_cfg: WorktreeConfig;
	readonly prompt_for: (issue: IssueRef, worktree_path: string) => Effect.Effect<string>;
}

const slice_key = (parent_id: IssueId, slice_id: SliceId) => `${parent_id}:${slice_id}` as const;

export const make_engine = (deps: EngineDeps) => {
	const handles = new Map<IssueId, WorkerHandle>();
	const worktrees = new Map<IssueId, WorktreeRef>();
	const slice_workers = new Map<string, WorkerHandle>();
	const slice_worktrees = new Map<string, WorktreeRef>();
	const parent_prds = new Map<IssueId, PRD>();
	const parent_last_manifest = new Map<IssueId, Manifest>();
	const timers = new Map<IssueId, NodeJS.Timeout>();

	const active_worker_count = () => handles.size + slice_workers.size;

	const has_in_flight_slice = (parent_id: IssueId): boolean => {
		for (const k of slice_workers.keys()) {
			if (k.startsWith(`${parent_id}:`)) return true;
		}
		return false;
	};

	const get_or_fetch_prd = (issue: IssueRef) =>
		Effect.gen(function* () {
			const cached = parent_prds.get(issue.id);
			if (cached) return cached;
			const prd = yield* read_parent_prd(deps.gh, issue);
			if (prd) parent_prds.set(issue.id, prd);
			return prd;
		});

	const seed_missing_slice_labels = (issue: IssueRef, manifest: Manifest) =>
		Effect.gen(function* () {
			const known_ids = new Set<SliceId>();
			for (const l of issue.labels) {
				const m = l.match(/^slice:([a-z0-9-]{1,32}):/);
				if (m?.[1]) known_ids.add(m[1] as SliceId);
			}
			for (const s of manifest.slices) {
				if (known_ids.has(s.id)) continue;
				yield* deps.gh
					.set_slice_label({
						issue: issue.id,
						slice_id: s.id,
						from: null,
						to: "open",
					})
					.pipe(Effect.ignore);
				(issue.labels as Set<string>).add(slice_label(s.id, "open"));
			}
		});

	const update_one_slice_from_pr = (req: {
		readonly issue: IssueRef;
		readonly slice_id: SliceId;
		readonly parent_branch: string;
		readonly states: Map<SliceId, SliceState>;
	}): Effect.Effect<SliceState | null> =>
		Effect.gen(function* () {
			const slice_branch = slice_branch_for(req.parent_branch, req.slice_id);
			const pr = yield* deps.gh
				.find_pr_by_branch(slice_branch)
				.pipe(Effect.catchAll(() => Effect.succeed(null)));
			if (!pr) return null;
			const next: SliceState | null = pr.merged ? "done" : pr.state === "CLOSED" ? "failed" : null;
			if (!next) return null;
			yield* deps.gh
				.set_slice_label({
					issue: req.issue.id,
					slice_id: req.slice_id,
					from: "in-progress",
					to: next,
				})
				.pipe(Effect.ignore);
			req.states.set(req.slice_id, next);
			return next;
		});

	const update_slice_states_from_prs = (
		issue: IssueRef,
		states: Map<SliceId, SliceState>,
	): Effect.Effect<ReadonlyArray<SliceId>> =>
		Effect.gen(function* () {
			const wt = worktrees.get(issue.id);
			if (!wt) return [];
			const newly_done: SliceId[] = [];
			for (const [id, st] of states) {
				if (st !== "in-progress") continue;
				const next = yield* update_one_slice_from_pr({
					issue,
					slice_id: id,
					parent_branch: wt.branch,
					states,
				});
				if (next === "done") newly_done.push(id);
			}
			return newly_done;
		});

	const validate_and_revert_manifest = (
		issue: IssueRef,
		states: ReadonlyMap<SliceId, SliceState>,
	) =>
		Effect.gen(function* () {
			const wt = worktrees.get(issue.id);
			if (!wt) return;
			yield* pull_ff(wt).pipe(Effect.ignore);
			const current = yield* read_manifest(wt.path).pipe(
				Effect.catchAll(() => Effect.succeed(null)),
			);
			if (!current) return;
			const last_seen = parent_last_manifest.get(issue.id);
			if (!last_seen) {
				parent_last_manifest.set(issue.id, current);
				return;
			}
			const diff = diff_manifests(last_seen, current);
			const violations = validate_diff(diff, states);
			if (violations.length === 0) {
				parent_last_manifest.set(issue.id, current);
				return;
			}
			const corrected = apply_revert({ current, last_seen, violations });
			yield* write_manifest(wt.path, corrected).pipe(Effect.ignore);
			yield* commit_and_push_files({
				wt,
				files: [MANIFEST_PATH],
				message: "chore(orchestrator): revert illegal manifest edits",
			}).pipe(Effect.ignore);
			yield* deps.gh
				.comment(
					issue.id,
					`Reverted illegal manifest edits on slices: ${violations
						.map((v) => `\`${v.id}\` (${v.kind}, was \`${v.state}\`)`)
						.join(", ")}.`,
				)
				.pipe(Effect.ignore);
			parent_last_manifest.set(issue.id, corrected);
		});

	const watch_slice_exit = (parent: IssueRef, slice_id: SliceId) => {
		const key = slice_key(parent.id, slice_id);
		void Effect.runPromise(
			Effect.gen(function* () {
				const handle = slice_workers.get(key);
				if (!handle) return;
				const exit = yield* handle.wait();
				slice_workers.delete(key);
				const wt = slice_worktrees.get(key);
				if (wt) {
					yield* remove_worktree(deps.worktree_cfg, wt).pipe(Effect.ignore);
					slice_worktrees.delete(key);
				}
				if (exit._tag === "Abnormal") {
					yield* deps.gh
						.set_slice_label({
							issue: parent.id,
							slice_id,
							from: "in-progress",
							to: "failed",
						})
						.pipe(Effect.ignore);
					yield* deps.gh
						.comment(
							parent.id,
							`Slice \`${slice_id}\` worker exited abnormally (code ${exit.code}). Marked :failed.`,
						)
						.pipe(Effect.ignore);
				}
			}) as Effect.Effect<void>,
		);
	};

	const dispatch_one_slice = (req: {
		readonly parent: IssueRef;
		readonly parent_wt: WorktreeRef;
		readonly slice: Slice;
		readonly manifest: Manifest;
		readonly dep_history: ReadonlyArray<DepHistory>;
		readonly prd: PRD;
	}) =>
		Effect.gen(function* () {
			const { parent, parent_wt, slice, prd, dep_history } = req;
			const parent_slug = parent_wt.branch.replace(/^auto\//, "");
			const slice_path = slice_worktree_path({
				cfg: deps.worktree_cfg,
				parent_slug,
				slice_id: slice.id,
			});
			const slice_branch = slice_branch_for(parent_wt.branch, slice.id);
			const swt = yield* ensure_worktree_at({
				cfg: deps.worktree_cfg,
				path: slice_path,
				branch: slice_branch,
				base_branch: parent_wt.branch,
			});
			const key = slice_key(parent.id, slice.id);
			slice_worktrees.set(key, swt);
			const prompt = assemble_slice_prompt({
				parent,
				prd,
				slice,
				done_deps: dep_history,
				parent_branch: parent_wt.branch,
			});
			const handle = yield* spawn_worker({
				issue: parent,
				engine: "claude",
				worker_id: deps.self_worker,
				worktree_path: swt.path,
				prompt,
			});
			slice_workers.set(key, handle);
			yield* deps.gh
				.set_slice_label({
					issue: parent.id,
					slice_id: slice.id,
					from: "open",
					to: "in-progress",
				})
				.pipe(Effect.ignore);
			watch_slice_exit(parent, slice.id);
		});

	const dispatch_next_ready_slice = (req: {
		readonly parent: IssueRef;
		readonly manifest: Manifest;
		readonly states: ReadonlyMap<SliceId, SliceState>;
	}) =>
		Effect.gen(function* () {
			const { parent, manifest, states } = req;
			if (has_in_flight_slice(parent.id)) return;
			if (active_worker_count() >= deps.cfg.max_concurrent) return;
			const ready = ready_slices(manifest, states);
			const slice = ready[0];
			if (!slice) return;
			const parent_wt = worktrees.get(parent.id);
			if (!parent_wt) return;
			const prd = yield* get_or_fetch_prd(parent);
			if (!prd) return;
			const dep_history = yield* collect_dep_history({
				parent_branch: parent_wt.branch,
				slice,
				manifest,
				gh: deps.gh,
			});
			yield* dispatch_one_slice({
				parent,
				parent_wt,
				slice,
				manifest,
				dep_history,
				prd,
			}).pipe(Effect.catchAll(() => Effect.void));
		});

	const handle_termination = (req: {
		readonly issue: IssueRef;
		readonly term: ReturnType<typeof parent_termination>;
	}): Effect.Effect<boolean> =>
		Effect.gen(function* () {
			const { issue, term } = req;
			if (term._tag === "all-done") {
				yield* deps.gh.close(issue.id).pipe(Effect.ignore);
				yield* terminate(issue.id, "done");
				return true;
			}
			if (term._tag === "blocked-by-failed") {
				yield* deps.gh
					.comment(
						issue.id,
						`Blocked: slice(s) failed — ${term.failed.join(", ")}. Re-label \`slice:<id>:failed → :open\` to retry.`,
					)
					.pipe(Effect.ignore);
			}
			return false;
		});

	const prepare_slice_state = (issue: IssueRef, manifest: Manifest) =>
		Effect.gen(function* () {
			yield* seed_missing_slice_labels(issue, manifest);
			if (!parent_last_manifest.has(issue.id)) {
				parent_last_manifest.set(issue.id, manifest);
			}
			const states = derive_slice_states(issue.labels);
			const newly_done = yield* update_slice_states_from_prs(issue, states);
			if (newly_done.length > 0) {
				yield* validate_and_revert_manifest(issue, states);
			}
			return states;
		});

	const reconcile_slice_aware = (issue: IssueRef): Effect.Effect<boolean> =>
		Effect.gen(function* () {
			const wt = worktrees.get(issue.id);
			if (!wt) return false;
			const manifest = yield* read_manifest(wt.path).pipe(
				Effect.catchAll(() => Effect.succeed(null)),
			);
			if (!manifest) return false;
			const states = yield* prepare_slice_state(issue, manifest);
			const term = parent_termination(manifest, states);
			const terminal = yield* handle_termination({ issue, term });
			if (terminal) return true;
			if (term._tag === "blocked-by-failed") return false;
			yield* dispatch_next_ready_slice({ parent: issue, manifest, states });
			return false;
		});

	const reconcile_pr_outcome = (id: IssueId, ref: IssueRef) =>
		Effect.gen(function* () {
			const pr = yield* deps.gh
				.find_pr_by_branch(branch_for(ref))
				.pipe(Effect.catchAll(() => Effect.succeed(null)));
			if (pr?.merged) {
				yield* terminate(id, "done");
				return true;
			}
			if (pr?.state === "CLOSED") {
				yield* terminate(id, "rejected");
				return true;
			}
			return false;
		});

	const reconcile_one = (id: IssueId) =>
		Effect.gen(function* () {
			const fresh = yield* deps.gh.view(id).pipe(
				Effect.map((r) => ({ _tag: "Some" as const, ref: r })),
				Effect.catchTag("NotFound", () => Effect.succeed({ _tag: "None" as const })),
				Effect.catchTag("GhError", () => Effect.succeed({ _tag: "None" as const })),
			);
			if (fresh._tag === "None") {
				yield* terminate(id, "rejected");
				return;
			}
			if (yield* reconcile_slice_aware(fresh.ref)) return;
			if (yield* reconcile_pr_outcome(id, fresh.ref)) return;
			const should_kill = fresh.ref.state === "closed" || !fresh.ref.labels.has(IN_PROGRESS_LABEL);
			if (should_kill) yield* terminate(id, "rejected");
		});

	const reconcile = Effect.gen(function* () {
		const state = yield* deps.store.get();
		for (const id of state.claimed) {
			yield* reconcile_one(id);
		}
	});

	const cleanup_slice_workers = (id: IssueId) =>
		Effect.gen(function* () {
			for (const [k, sh] of slice_workers) {
				if (!k.startsWith(`${id}:`)) continue;
				yield* sh.kill();
				slice_workers.delete(k);
				const swt = slice_worktrees.get(k);
				if (swt) {
					yield* remove_worktree(deps.worktree_cfg, swt).pipe(Effect.ignore);
					slice_worktrees.delete(k);
				}
			}
		});

	const terminate = (id: IssueId, outcome: Outcome | null) =>
		Effect.gen(function* () {
			const pending_timer = timers.get(id);
			if (pending_timer) {
				clearTimeout(pending_timer);
				timers.delete(id);
			}
			yield* deps.store.remove_retry(id);
			const h = handles.get(id);
			if (h) yield* h.kill();
			handles.delete(id);
			yield* cleanup_slice_workers(id);
			parent_prds.delete(id);
			parent_last_manifest.delete(id);
			const wt = worktrees.get(id);
			if (wt && (outcome === "done" || outcome === "rejected")) {
				yield* remove_worktree(deps.worktree_cfg, wt).pipe(Effect.ignore);
				worktrees.delete(id);
			}
			yield* deps.store.remove_running(id);
			yield* deps.store.remove_claimed(id);
			yield* deps.gh.release(id, outcome).pipe(Effect.ignore);
		});

	const schedule_retry = (req: {
		readonly id: IssueId;
		readonly identifier: string;
		readonly attempt: number;
		readonly kind: RetryEntry["kind"];
		readonly error: string | null;
	}) =>
		Effect.gen(function* () {
			const { id, identifier, attempt, kind, error } = req;
			const delay = kind === "continuation" ? CONTINUATION_DELAY_MS : failure_backoff(attempt);
			const due_at_ms = Date.now() + delay;
			const prev = timers.get(id);
			if (prev) clearTimeout(prev);
			const handle = setTimeout(() => {
				timers.delete(id);
				void Effect.runPromise(on_retry_fired(id) as Effect.Effect<void>);
			}, delay);
			timers.set(id, handle);
			yield* deps.store.upsert_retry({
				issue_id: id,
				identifier,
				attempt,
				due_at_ms,
				timer_handle: handle,
				error,
				kind,
			});
		});

	const on_retry_fired = (id: IssueId) =>
		Effect.gen(function* () {
			yield* deps.store.remove_retry(id);
			const fresh = yield* deps.gh.view(id).pipe(
				Effect.map((r) => ({ _tag: "Some" as const, ref: r })),
				Effect.catchAll(() => Effect.succeed({ _tag: "None" as const })),
			);
			if (fresh._tag === "None" || fresh.ref.state === "closed") {
				yield* deps.store.remove_claimed(id);
				return;
			}
			const state = yield* deps.store.get();
			if (
				!dispatch_gate_ok({
					state,
					issue: fresh.ref,
					max_concurrent: deps.cfg.max_concurrent,
					active_workers: active_worker_count(),
				})
			)
				return;
			yield* try_dispatch(fresh.ref);
		});

	const try_dispatch = (issue: IssueRef) =>
		Effect.gen(function* () {
			yield* deps.store.add_claimed(issue.id);
			yield* deps.gh.claim(issue.id, deps.self_worker).pipe(
				Effect.catchTag("ClaimContended", () =>
					deps.store.remove_claimed(issue.id).pipe(Effect.andThen(Effect.fail("contended"))),
				),
				Effect.catchAll(() =>
					deps.store.remove_claimed(issue.id).pipe(Effect.andThen(Effect.fail("gh"))),
				),
			);
			const wt = yield* ensure_worktree(deps.worktree_cfg, issue).pipe(
				Effect.catchAll((e) =>
					deps.store.remove_claimed(issue.id).pipe(Effect.andThen(Effect.fail(e.message))),
				),
			);
			worktrees.set(issue.id, wt);

			const prd = yield* get_or_fetch_prd(issue);
			const manifest = yield* read_manifest(wt.path).pipe(
				Effect.catchAll(() => Effect.succeed(null)),
			);
			const slice_mode = prd && (prd.slice_hint === "dag" || prd.slice_hint === "linear");
			if (slice_mode && manifest) {
				return;
			}

			const prompt = yield* deps.prompt_for(issue, wt.path);
			const handle = yield* spawn_worker({
				issue,
				engine: "claude",
				worker_id: deps.self_worker,
				worktree_path: wt.path,
				prompt,
			}).pipe(Effect.catchAll((e) => Effect.fail(e.message)));
			handles.set(issue.id, handle);
			const entry: RunningEntry = {
				issue_id: issue.id,
				identifier: issue.identifier,
				worker_id: deps.self_worker,
				session_id: handle.session_id,
				worker_pid: handle.pid,
				last_event: null,
				last_event_at: null,
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0,
				started_at: Date.now(),
				retry_attempt: 0,
				phase: "LaunchingAgentProcess",
			};
			yield* deps.store.add_running(entry);
			watch_exit(issue, entry);
		});

	const watch_exit = (issue: IssueRef, entry: RunningEntry) => {
		void Effect.runPromise(
			Effect.gen(function* () {
				const handle = handles.get(issue.id);
				if (!handle) return;
				const exit = yield* handle.wait();
				handles.delete(issue.id);
				yield* deps.store.remove_running(issue.id);
				if (exit._tag === "Normal") {
					yield* schedule_retry({
						id: issue.id,
						identifier: issue.identifier,
						attempt: 1,
						kind: "continuation",
						error: null,
					});
				} else if (exit._tag === "Abnormal") {
					yield* schedule_retry({
						id: issue.id,
						identifier: issue.identifier,
						attempt: entry.retry_attempt + 1,
						kind: "failure",
						error: `exit ${exit.code}`,
					});
				} else {
					yield* terminate(issue.id, "stalled");
				}
			}) as Effect.Effect<void>,
		);
	};

	const poll = Effect.gen(function* () {
		yield* reconcile;
		const candidates = yield* deps.gh.fetch_candidates({
			aligned: true,
			routing: ROUTING_LABEL[deps.cfg.backend],
		});
		const state = yield* deps.store.get();
		for (const issue of candidates) {
			if (!eligible_for_dispatch(issue, deps.cfg.backend)) continue;
			if (state.claimed.has(issue.id)) continue;
			if (
				!dispatch_gate_ok({
					state,
					issue,
					max_concurrent: deps.cfg.max_concurrent,
					active_workers: active_worker_count(),
				})
			)
				continue;
			yield* try_dispatch(issue).pipe(Effect.catchAll(() => Effect.void));
		}
	});

	return { poll, reconcile, terminate };
};
