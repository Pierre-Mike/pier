import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

const exec = promisify(execFile);

export type RepoFile = { path: string; size: number };

export class RepoError extends Data.TaggedError("RepoError")<{ message: string }> {}

export interface RepoService {
	readonly listFiles: (projectId: string) => Effect.Effect<RepoFile[], RepoError, never>;
	readonly resolvePath: (args: {
		projectId: string;
		path: string;
	}) => Effect.Effect<string, RepoError, never>;
	readonly fileStat: (absPath: string) => Effect.Effect<{ size: number }, RepoError, never>;
}

export const RepoService = Context.GenericTag<RepoService>("RepoService");

const projectRootFor = (projectsRoot: string, id: string): string => {
	if (!id || id.includes("..") || id.includes("/") || id.startsWith(".")) {
		throw new Error("bad project id");
	}
	return join(projectsRoot, id);
};

export const makeRepoServiceLive = (): Layer.Layer<RepoService, never, ConfigService> =>
	Layer.effect(
		RepoService,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			const root = (id: string): string => projectRootFor(config.projectsRoot, id);

			return {
				listFiles: (projectId) =>
					Effect.tryPromise({
						try: async () => {
							const { stdout } = await exec(
								"git",
								[
									"-C",
									root(projectId),
									"ls-files",
									"-z",
									"--cached",
									"--others",
									"--exclude-standard",
								],
								{ maxBuffer: 64 * 1024 * 1024 },
							);
							const seen = new Set<string>();
							const out: RepoFile[] = [];
							for (const p of stdout.split("\0")) {
								if (!p || seen.has(p)) continue;
								seen.add(p);
								out.push({ path: p, size: 0 });
							}
							return out;
						},
						catch: () => new RepoError({ message: "git ls-files failed" }),
					}).pipe(Effect.orElseSucceed(() => [] as RepoFile[])),

				resolvePath: ({ projectId, path }) =>
					Effect.try({
						try: () => {
							const r = root(projectId);
							if (!path || path.includes("\0")) throw new Error("bad path");
							const abs = resolve(r, path);
							const rootAbs = resolve(r) + sep;
							if (abs !== resolve(r) && !abs.startsWith(rootAbs)) {
								throw new Error("path escape");
							}
							return abs;
						},
						catch: (e) => new RepoError({ message: (e as Error).message }),
					}),

				fileStat: (absPath) =>
					Effect.tryPromise({
						try: async () => {
							const s = await stat(absPath);
							return { size: s.size };
						},
						catch: () => new RepoError({ message: "stat failed" }),
					}),
			};
		}),
	);

export const makeRepoServiceTest = (
	files: ReadonlyMap<string, RepoFile[]>,
): Layer.Layer<RepoService> =>
	Layer.succeed(RepoService, {
		listFiles: (projectId) => Effect.succeed(files.get(projectId) ?? []),
		resolvePath: ({ projectId, path }) => Effect.succeed(`/test/${projectId}/${path}`),
		fileStat: () => Effect.succeed({ size: 0 }),
	});
