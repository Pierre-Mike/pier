import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import * as YAML from "yaml";
import { SLICE_ID_PATTERN, type SliceId, type SliceState } from "./state.ts";

export interface Slice {
	readonly id: SliceId;
	readonly title: string;
	readonly deps: ReadonlyArray<SliceId>;
	readonly prompt_extra: string;
}

export interface Manifest {
	readonly slices: ReadonlyArray<Slice>;
}

export const MANIFEST_PATH = ".specs/slices.yaml";

export class ManifestError extends Error {
	readonly _tag = "ManifestError";
	constructor(readonly reason: string) {
		super(`manifest: ${reason}`);
	}
}

const validate_slice = (raw: unknown, idx: number): Slice => {
	if (!raw || typeof raw !== "object") {
		throw new Error(`slice[${idx}] not an object`);
	}
	const obj = raw as Record<string, unknown>;
	const id = obj["id"];
	if (typeof id !== "string" || !SLICE_ID_PATTERN.test(id)) {
		throw new Error(`slice[${idx}] invalid id: ${String(id)}`);
	}
	const title = obj["title"];
	if (typeof title !== "string" || title.length === 0) {
		throw new Error(`slice[${idx}] missing title`);
	}
	const deps_raw = obj["deps"] ?? [];
	if (!Array.isArray(deps_raw) || !deps_raw.every((d) => typeof d === "string")) {
		throw new Error(`slice[${idx}] deps must be string[]`);
	}
	const prompt_extra = typeof obj["prompt_extra"] === "string" ? obj["prompt_extra"] : "";
	return {
		id: id as SliceId,
		title,
		deps: deps_raw as unknown as ReadonlyArray<SliceId>,
		prompt_extra,
	};
};

const detect_cycle = (slices: ReadonlyArray<Slice>): SliceId[] | null => {
	const by_id = new Map(slices.map((s) => [s.id, s]));
	const color = new Map<SliceId, "white" | "gray" | "black">();
	for (const s of slices) color.set(s.id, "white");
	const stack: SliceId[] = [];
	const visit = (id: SliceId): SliceId[] | null => {
		const c = color.get(id);
		if (c === "gray") return [...stack, id];
		if (c === "black") return null;
		color.set(id, "gray");
		stack.push(id);
		const node = by_id.get(id);
		if (node) {
			for (const d of node.deps) {
				const cyc = visit(d);
				if (cyc) return cyc;
			}
		}
		stack.pop();
		color.set(id, "black");
		return null;
	};
	for (const s of slices) {
		const cyc = visit(s.id);
		if (cyc) return cyc;
	}
	return null;
};

export const parse_manifest = (raw: string): Manifest => {
	const parsed = YAML.parse(raw);
	if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.slices)) {
		throw new Error("missing slices array");
	}
	const slices = parsed.slices.map(validate_slice);
	const ids = new Set<SliceId>();
	for (const s of slices) {
		if (ids.has(s.id)) throw new Error(`duplicate slice id: ${s.id}`);
		ids.add(s.id);
	}
	for (const s of slices) {
		for (const d of s.deps) {
			if (!ids.has(d)) throw new Error(`slice ${s.id} deps unknown: ${d}`);
		}
	}
	const cycle = detect_cycle(slices);
	if (cycle) throw new Error(`dep cycle: ${cycle.join(" -> ")}`);
	return { slices };
};

export const read_manifest = (
	worktree_path: string,
): Effect.Effect<Manifest | null, ManifestError> =>
	Effect.gen(function* () {
		const path = join(worktree_path, MANIFEST_PATH);
		if (!existsSync(path)) return null;
		const raw = yield* Effect.tryPromise({
			try: () => Bun.file(path).text(),
			catch: (e) => new ManifestError(`read: ${e}`),
		});
		return yield* Effect.try({
			try: () => parse_manifest(raw),
			catch: (e) => new ManifestError(String(e)),
		});
	});

export interface ManifestDiff {
	readonly added: ReadonlyArray<Slice>;
	readonly removed: ReadonlyArray<SliceId>;
	readonly modified: ReadonlyArray<{
		readonly id: SliceId;
		readonly fields: ReadonlyArray<keyof Slice>;
	}>;
}

const slice_fields_changed = (a: Slice, b: Slice): Array<keyof Slice> => {
	const out: Array<keyof Slice> = [];
	if (a.title !== b.title) out.push("title");
	if (a.prompt_extra !== b.prompt_extra) out.push("prompt_extra");
	if (a.deps.length !== b.deps.length || a.deps.some((d, i) => d !== b.deps[i])) {
		out.push("deps");
	}
	return out;
};

export const diff_manifests = (before: Manifest, after: Manifest): ManifestDiff => {
	const before_by_id = new Map(before.slices.map((s) => [s.id, s]));
	const after_by_id = new Map(after.slices.map((s) => [s.id, s]));
	const added = after.slices.filter((s) => !before_by_id.has(s.id));
	const removed = before.slices.filter((s) => !after_by_id.has(s.id)).map((s) => s.id);
	const modified: Array<{ id: SliceId; fields: Array<keyof Slice> }> = [];
	for (const [id, b] of before_by_id) {
		const a = after_by_id.get(id);
		if (!a) continue;
		const fields = slice_fields_changed(b, a);
		if (fields.length > 0) modified.push({ id, fields });
	}
	return { added, removed, modified };
};

export type DiffViolation =
	| { readonly kind: "modified-locked"; readonly id: SliceId; readonly state: SliceState }
	| { readonly kind: "removed-locked"; readonly id: SliceId; readonly state: SliceState };

export const validate_diff = (
	diff: ManifestDiff,
	current_states: ReadonlyMap<SliceId, SliceState>,
): ReadonlyArray<DiffViolation> => {
	const out: DiffViolation[] = [];
	for (const m of diff.modified) {
		const st = current_states.get(m.id);
		if (st && st !== "open") out.push({ kind: "modified-locked", id: m.id, state: st });
	}
	for (const id of diff.removed) {
		const st = current_states.get(id);
		if (st && st !== "open") out.push({ kind: "removed-locked", id, state: st });
	}
	return out;
};

export const apply_revert = (args: {
	readonly current: Manifest;
	readonly last_seen: Manifest;
	readonly violations: ReadonlyArray<DiffViolation>;
}): Manifest => {
	const { current, last_seen, violations } = args;
	if (violations.length === 0) return current;
	const last_by_id = new Map(last_seen.slices.map((s) => [s.id, s]));
	const current_by_id = new Map(current.slices.map((s) => [s.id, s]));
	const violated_ids = new Set<SliceId>(violations.map((v) => v.id));
	for (const v of violations) {
		const restored = last_by_id.get(v.id);
		if (!restored) continue;
		current_by_id.set(v.id, restored);
	}
	const restored_order: Slice[] = [];
	for (const s of last_seen.slices) {
		if (violated_ids.has(s.id)) {
			const slice = current_by_id.get(s.id);
			if (slice) restored_order.push(slice);
		}
	}
	const others = current.slices.filter((s) => !violated_ids.has(s.id));
	return { slices: [...others, ...restored_order] };
};

export const stringify_manifest = (manifest: Manifest): string =>
	YAML.stringify({ slices: manifest.slices.map((s) => ({ ...s })) });

export const write_manifest = (
	worktree_path: string,
	manifest: Manifest,
): Effect.Effect<void, ManifestError> =>
	Effect.gen(function* () {
		const path = join(worktree_path, MANIFEST_PATH);
		yield* Effect.tryPromise({
			try: () => Bun.write(path, stringify_manifest(manifest)),
			catch: (e) => new ManifestError(`write: ${e}`),
		});
	});
