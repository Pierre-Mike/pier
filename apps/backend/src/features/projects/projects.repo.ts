import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

export type Project = {
	id: string;
	name: string;
	path: string;
	isGitRepo: boolean;
	lastModified: number;
};

export interface ProjectsService {
	readonly list: () => Effect.Effect<Project[], never, never>;
}

export const ProjectsService = Context.GenericTag<ProjectsService>("ProjectsService");

const probeProject = (
	projectsRoot: string,
	entry: string,
): Effect.Effect<Project | null, never, never> =>
	Effect.tryPromise(async () => {
		if (entry.startsWith(".")) return null;
		const path = join(projectsRoot, entry);
		const s = await stat(path);
		if (!s.isDirectory()) return null;
		let isGitRepo = false;
		try {
			const gs = await stat(join(path, ".git"));
			isGitRepo = gs.isDirectory() || gs.isFile();
		} catch {
			isGitRepo = false;
		}
		return {
			id: entry,
			name: entry,
			path,
			isGitRepo,
			lastModified: s.mtimeMs,
		};
	}).pipe(Effect.orElseSucceed(() => null));

export const makeProjectsServiceLive = (): Layer.Layer<ProjectsService, never, ConfigService> =>
	Layer.effect(
		ProjectsService,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			return {
				list: () =>
					Effect.gen(function* () {
						const entries = yield* Effect.tryPromise(() => readdir(config.projectsRoot)).pipe(
							Effect.orElseSucceed(() => [] as string[]),
						);
						const probed = yield* Effect.all(
							entries.map((e) => probeProject(config.projectsRoot, e)),
							{ concurrency: 8 },
						);
						const projects = probed.filter((p): p is Project => p !== null);
						projects.sort((a, b) => b.lastModified - a.lastModified);
						return projects;
					}),
			};
		}),
	);

export const makeProjectsServiceTest = (
	fixtures: readonly Project[],
): Layer.Layer<ProjectsService> =>
	Layer.succeed(ProjectsService, {
		list: () => Effect.succeed([...fixtures].sort((a, b) => b.lastModified - a.lastModified)),
	});
