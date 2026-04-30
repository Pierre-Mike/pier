import type { Stats } from "node:fs";
import { watch } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";
import type { Artifact, ArtifactBusService, ArtifactEvent } from "../../platform/sse-bus.ts";
import { ArtifactBus } from "../../platform/sse-bus.ts";
import { classify } from "./artifacts.blob-classify.core.ts";

export interface ArtifactWatcher {
	readonly start: () => Effect.Effect<void, never, never>;
	readonly list: (opts?: { project?: string; limit?: number }) => Effect.Effect<Artifact[], never>;
}

export const ArtifactWatcher = Context.GenericTag<ArtifactWatcher>("ArtifactWatcher");

const toArtifact = (opts: {
	absPath: string;
	artifactsDir: string;
}): Effect.Effect<Artifact | null, never, never> =>
	Effect.gen(function* () {
		const { absPath, artifactsDir } = opts;
		const s = yield* Effect.tryPromise(() => stat(absPath)).pipe(Effect.orElseSucceed(() => null));
		if (!s?.isFile()) return null;
		const rel = relative(artifactsDir, absPath);
		const parts = rel.split("/");
		const project = parts[0] ?? "unknown";
		const run = parts.length > 2 ? parts[1] : undefined;
		const name = parts[parts.length - 1];
		if (!name) return null;
		const ext = extname(name).toLowerCase();
		const { kind } = classify(name);
		const artifact: Artifact = {
			id: rel,
			project,
			name,
			ext,
			kind,
			size: s.size,
			mtime: s.mtimeMs,
			path: absPath,
		};
		if (run) artifact.run = run;
		return artifact;
	});

const safeStat = (p: string): Effect.Effect<Stats | null, never, never> =>
	Effect.tryPromise(() => stat(p)).pipe(Effect.orElseSucceed(() => null));

const safeReaddir = (p: string): Effect.Effect<string[], never, never> =>
	Effect.tryPromise(() => readdir(p)).pipe(Effect.orElseSucceed(() => [] as string[]));

type WalkContext = {
	readonly artifactsDir: string;
	readonly project: string | undefined;
	readonly out: Artifact[];
};

type WalkEntryArgs = {
	readonly ctx: WalkContext;
	readonly parent: string;
	readonly entry: string;
	readonly depth: number;
};

type WalkArgs = {
	readonly ctx: WalkContext;
	readonly dir: string;
	readonly depth: number;
};

const walkEntry = (args: WalkEntryArgs): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { ctx, parent, entry, depth } = args;
		if (entry.startsWith(".")) return;
		const p = join(parent, entry);
		const s = yield* safeStat(p);
		if (!s) return;
		if (s.isDirectory()) {
			yield* walk({ ctx, dir: p, depth: depth + 1 });
			return;
		}
		if (!s.isFile()) return;
		const a = yield* toArtifact({ absPath: p, artifactsDir: ctx.artifactsDir });
		if (a && (!ctx.project || a.project === ctx.project)) ctx.out.push(a);
	});

const walk = (args: WalkArgs): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { ctx, dir, depth } = args;
		if (depth > 5) return;
		const entries = yield* safeReaddir(dir);
		for (const e of entries) {
			yield* walkEntry({ ctx, parent: dir, entry: e, depth });
		}
	});

const listArtifactsImpl = (opts: {
	artifactsDir: string;
	project?: string;
	limit?: number;
}): Effect.Effect<Artifact[], never, never> =>
	Effect.gen(function* () {
		const { artifactsDir, project, limit = 200 } = opts;
		const out: Artifact[] = [];
		yield* walk({ ctx: { artifactsDir, project, out }, dir: artifactsDir, depth: 0 });
		out.sort((a, b) => b.mtime - a.mtime);
		return out.slice(0, limit);
	});

type ChangeOutcome =
	| { kind: "ignore" }
	| { kind: "unlink" }
	| { kind: "emit"; event: "add" | "change"; mtime: number };

const classifyChange = (args: { st: Stats | null; prev: number | undefined }): ChangeOutcome => {
	const { st, prev } = args;
	if (!st) return prev === undefined ? { kind: "ignore" } : { kind: "unlink" };
	if (!st.isFile()) return { kind: "ignore" };
	if (prev !== undefined && Math.abs(prev - st.mtimeMs) < 2) return { kind: "ignore" };
	const event = prev === undefined ? "add" : "change";
	return { kind: "emit", event, mtime: st.mtimeMs };
};

const isHidden = (filename: string): boolean => filename.split("/").some((p) => p.startsWith("."));

type EmitArgs = {
	readonly filename: string;
	readonly artifactsDir: string;
	readonly known: Map<string, number>;
	readonly bus: ArtifactBusService;
};

const emitChange = (args: EmitArgs): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { filename, artifactsDir, known, bus } = args;
		if (isHidden(filename)) return;
		const abs = join(artifactsDir, filename);
		const st = yield* safeStat(abs);
		const outcome = classifyChange({ st, prev: known.get(filename) });
		if (outcome.kind === "ignore") return;
		if (outcome.kind === "unlink") {
			known.delete(filename);
			const evt: ArtifactEvent = { kind: "unlink", artifact: null, id: filename };
			yield* bus.emit(evt);
			return;
		}
		known.set(filename, outcome.mtime);
		const a = yield* toArtifact({ absPath: abs, artifactsDir });
		if (a) yield* bus.emit({ kind: outcome.event, artifact: a, id: a.id });
	});

export const makeArtifactWatcherLive = (): Layer.Layer<
	ArtifactWatcher,
	never,
	ArtifactBusService | ConfigService
> =>
	Layer.effect(
		ArtifactWatcher,
		Effect.gen(function* () {
			const bus = yield* ArtifactBus;
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			const artifactsDir = config.artifactsDir;
			let started = false;
			const known = new Map<string, number>();

			return {
				start: () =>
					Effect.gen(function* () {
						if (started) return;
						started = true;
						yield* Effect.tryPromise(() => mkdir(artifactsDir, { recursive: true })).pipe(
							Effect.orElseSucceed(() => undefined),
						);
						const w = watch(artifactsDir, { recursive: true, persistent: true });
						w.on("change", (_event, filename) => {
							const f = typeof filename === "string" ? filename : (filename?.toString() ?? "");
							if (!f) return;
							Effect.runPromise(emitChange({ filename: f, artifactsDir, known, bus })).catch(() => {
								/* ignore */
							});
						});
						w.on("error", (err) => {
							// biome-ignore lint/suspicious/noConsole: watcher errors are diagnostic, not user-facing
							console.error("[artifacts watcher]", err);
						});
					}),
				list: (o) => {
					const opts: { artifactsDir: string; project?: string; limit?: number } = { artifactsDir };
					if (o?.project) opts.project = o.project;
					if (o?.limit) opts.limit = o.limit;
					return listArtifactsImpl(opts);
				},
			};
		}),
	);

export const ArtifactWatcherTest: Layer.Layer<ArtifactWatcher> = Layer.succeed(ArtifactWatcher, {
	start: () => Effect.void,
	list: () => Effect.succeed([]),
});
