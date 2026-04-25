import { watch } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { Context, Effect, Layer } from "effect";
import { classify } from "../core/blob-classify.ts";
import { ConfigService } from "./config.ts";
import type { Artifact, ArtifactBusService } from "./sse-bus.ts";
import { ArtifactBus } from "./sse-bus.ts";

export interface ArtifactWatcher {
	readonly start: () => Effect.Effect<void, never, never>;
	readonly list: (opts?: { project?: string; limit?: number }) => Effect.Effect<Artifact[], never>;
}

export const ArtifactWatcher = Context.GenericTag<ArtifactWatcher>("ArtifactWatcher");

const toArtifact = (
	absPath: string,
	artifactsDir: string,
): Effect.Effect<Artifact | null, never, never> =>
	Effect.gen(function* () {
		const s = yield* Effect.tryPromise(() => stat(absPath)).pipe(Effect.orElseSucceed(() => null));
		if (!s || !s.isFile()) return null;
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
		if (run) {
			artifact.run = run;
		}
		return artifact;
	});

const listArtifactsImpl = (opts: {
	artifactsDir: string;
	project?: string;
	limit?: number;
}): Effect.Effect<Artifact[], never, never> =>
	Effect.gen(function* () {
		const { artifactsDir, project, limit = 200 } = opts;
		const out: Artifact[] = [];
		const walk = (dir: string, depth: number): Effect.Effect<void, never, never> =>
			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Effect generators require sequential logic
			Effect.gen(function* () {
				if (depth > 5) return;
				const entries = yield* Effect.tryPromise(() => readdir(dir)).pipe(
					Effect.orElseSucceed(() => [] as string[]),
				);
				for (const e of entries) {
					if (e.startsWith(".")) continue;
					const p = join(dir, e);
					const s = yield* Effect.tryPromise(() => stat(p)).pipe(Effect.orElseSucceed(() => null));
					if (!s) continue;
					if (s.isDirectory()) {
						yield* walk(p, depth + 1);
					} else if (s.isFile()) {
						const a = yield* toArtifact(p, artifactsDir);
						if (a && (!project || a.project === project)) {
							out.push(a);
						}
					}
				}
			});
		yield* walk(artifactsDir, 0);
		out.sort((a, b) => b.mtime - a.mtime);
		return out.slice(0, limit);
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

			const emit = (filename: string): Effect.Effect<void, never, never> =>
				// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Effect generators require sequential logic
				Effect.gen(function* () {
					if (filename.split("/").some((p) => p.startsWith("."))) return;
					const abs = join(artifactsDir, filename);
					const st = yield* Effect.tryPromise(() => stat(abs)).pipe(
						Effect.orElseSucceed(() => null),
					);
					if (!st) {
						if (known.delete(filename)) {
							yield* bus.emit({ kind: "unlink", artifact: null, id: filename });
						}
						return;
					}
					if (!st.isFile()) return;
					const prev = known.get(filename);
					const kind: "add" | "change" = prev === undefined ? "add" : "change";
					if (prev !== undefined && Math.abs(prev - st.mtimeMs) < 2) return;
					known.set(filename, st.mtimeMs);
					const a = yield* toArtifact(abs, artifactsDir);
					if (a) {
						yield* bus.emit({ kind, artifact: a, id: a.id });
					}
				});

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
							if (f) {
								Effect.runPromise(emit(f)).catch(() => {
									/* ignore */
								});
							}
						});
						w.on("error", (err) => {
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
