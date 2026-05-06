import { Effect, Ref } from "effect";
import type { IssueId, OrchestratorState, RetryEntry, RunningEntry } from "./state.ts";

export interface Store {
	readonly get: () => Effect.Effect<OrchestratorState>;
	readonly add_running: (e: RunningEntry) => Effect.Effect<void>;
	readonly remove_running: (id: IssueId) => Effect.Effect<void>;
	readonly add_claimed: (id: IssueId) => Effect.Effect<void>;
	readonly remove_claimed: (id: IssueId) => Effect.Effect<void>;
	readonly upsert_retry: (e: RetryEntry) => Effect.Effect<void>;
	readonly remove_retry: (id: IssueId) => Effect.Effect<void>;
	readonly snapshot_path: string;
}

const empty_state = (): OrchestratorState => ({
	running: new Map(),
	claimed: new Set(),
	retry_queue: new Map(),
});

interface SerializedState {
	readonly running: ReadonlyArray<RunningEntry>;
	readonly claimed: ReadonlyArray<IssueId>;
	readonly retry_queue: ReadonlyArray<Omit<RetryEntry, "timer_handle">>;
}

const serialize = (s: OrchestratorState): SerializedState => ({
	running: [...s.running.values()],
	claimed: [...s.claimed],
	retry_queue: [...s.retry_queue.values()].map(({ timer_handle: _t, ...rest }) => rest),
});

const deserialize = (raw: unknown): OrchestratorState => {
	const s = raw as Partial<SerializedState>;
	const running = new Map<IssueId, RunningEntry>((s.running ?? []).map((e) => [e.issue_id, e]));
	const claimed = new Set<IssueId>(s.claimed ?? []);
	const retry_queue = new Map<IssueId, RetryEntry>(
		(s.retry_queue ?? []).map((e) => [
			e.issue_id,
			{ ...e, timer_handle: null } satisfies RetryEntry,
		]),
	);
	return { running, claimed, retry_queue };
};

export const make_store = (snapshot_path: string) =>
	Effect.gen(function* () {
		const initial = yield* Effect.tryPromise({
			try: async () => {
				const file = Bun.file(snapshot_path);
				if (!(await file.exists())) return empty_state();
				return deserialize(await file.json());
			},
			catch: () => empty_state(),
		}).pipe(Effect.orElseSucceed(() => empty_state()));

		const ref = yield* Ref.make<OrchestratorState>(initial);

		const persist = Effect.gen(function* () {
			const snap = yield* Ref.get(ref);
			yield* Effect.tryPromise({
				try: () => Bun.write(snapshot_path, JSON.stringify(serialize(snap), null, 2)),
				catch: () => undefined,
			}).pipe(Effect.ignore);
		});

		const update = (f: (s: OrchestratorState) => OrchestratorState) =>
			Ref.update(ref, f).pipe(Effect.tap(() => persist));

		const store: Store = {
			snapshot_path,
			get: () => Ref.get(ref),
			add_running: (e) =>
				update((s) => ({
					...s,
					running: new Map(s.running).set(e.issue_id, e),
				})),
			remove_running: (id) =>
				update((s) => {
					const m = new Map(s.running);
					m.delete(id);
					return { ...s, running: m };
				}),
			add_claimed: (id) => update((s) => ({ ...s, claimed: new Set(s.claimed).add(id) })),
			remove_claimed: (id) =>
				update((s) => {
					const set = new Set(s.claimed);
					set.delete(id);
					return { ...s, claimed: set };
				}),
			upsert_retry: (e) =>
				update((s) => ({
					...s,
					retry_queue: new Map(s.retry_queue).set(e.issue_id, e),
				})),
			remove_retry: (id) =>
				update((s) => {
					const m = new Map(s.retry_queue);
					m.delete(id);
					return { ...s, retry_queue: m };
				}),
		};
		return store;
	});
