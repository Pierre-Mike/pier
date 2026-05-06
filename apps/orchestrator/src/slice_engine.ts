import { Effect } from "effect";
import type { GhAdapter } from "./gh-adapter.ts";
import type { Manifest, Slice } from "./manifest.ts";
import type { DepHistory } from "./prompt.ts";
import { parse_slice_label, type SliceId, type SliceState } from "./state.ts";

export const derive_slice_states = (labels: ReadonlySet<string>): Map<SliceId, SliceState> => {
	const map = new Map<SliceId, SliceState>();
	for (const l of labels) {
		const parsed = parse_slice_label(l);
		if (parsed) map.set(parsed.id, parsed.status);
	}
	return map;
};

export const ready_slices = (
	manifest: Manifest,
	states: ReadonlyMap<SliceId, SliceState>,
): ReadonlyArray<Slice> =>
	manifest.slices.filter((s) => {
		const own = states.get(s.id);
		if (own !== "open") return false;
		return s.deps.every((d) => states.get(d) === "done");
	});

export type ParentTermination =
	| { readonly _tag: "all-done" }
	| { readonly _tag: "blocked-by-failed"; readonly failed: ReadonlyArray<SliceId> }
	| { readonly _tag: "in-progress" };

export const parent_termination = (
	manifest: Manifest,
	states: ReadonlyMap<SliceId, SliceState>,
): ParentTermination => {
	if (manifest.slices.length === 0) return { _tag: "in-progress" };
	const failed: SliceId[] = [];
	let all_done = true;
	for (const s of manifest.slices) {
		const st = states.get(s.id);
		if (st === "failed") failed.push(s.id);
		if (st !== "done") all_done = false;
	}
	if (failed.length > 0 && !ready_slices_exist(manifest, states)) {
		return { _tag: "blocked-by-failed", failed };
	}
	if (all_done) return { _tag: "all-done" };
	return { _tag: "in-progress" };
};

const ready_slices_exist = (
	manifest: Manifest,
	states: ReadonlyMap<SliceId, SliceState>,
): boolean => ready_slices(manifest, states).length > 0;

export const slice_branch_for = (parent_branch: string, slice_id: SliceId): string =>
	`${parent_branch}/slice-${slice_id}`;

export interface DepHistoryArgs {
	readonly parent_branch: string;
	readonly slice: Slice;
	readonly manifest: Manifest;
	readonly gh: GhAdapter;
}

export const collect_dep_history = (
	args: DepHistoryArgs,
): Effect.Effect<ReadonlyArray<DepHistory>> =>
	Effect.gen(function* () {
		const { parent_branch, slice, manifest, gh } = args;
		const by_id = new Map(manifest.slices.map((s) => [s.id, s]));
		const out: DepHistory[] = [];
		for (const dep_id of slice.deps) {
			const dep = by_id.get(dep_id);
			if (!dep) continue;
			const branch = slice_branch_for(parent_branch, dep_id);
			const pr = yield* gh
				.find_pr_by_branch(branch)
				.pipe(Effect.catchAll(() => Effect.succeed(null)));
			out.push({
				id: dep_id,
				title: dep.title,
				pr_number: pr?.number ?? null,
			});
		}
		return out;
	});
