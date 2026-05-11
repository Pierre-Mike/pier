import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

const exec = promisify(execFile);

export type RepoFile = { path: string; size: number; ignored: boolean };

/** One immediate child entry returned by listFilesInPrefix. */
export type ChildEntry = {
	readonly path: string;
	readonly isDir: boolean;
	readonly ignored: boolean;
};

export class RepoError extends Data.TaggedError("RepoError")<{ message: string }> {}

export interface RepoService {
	readonly listFiles: (projectId: string) => Effect.Effect<RepoFile[], RepoError, never>;
	/**
	 * Returns immediate children (files + directories) under `prefix`.
	 * `prefix` is a repo-relative path without leading/trailing slashes.
	 * Empty string means the repo root.
	 */
	readonly listFilesInPrefix: (
		projectId: string,
		prefix: string,
	) => Effect.Effect<ChildEntry[], RepoError, never>;
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

const GIT_LS_BUFFER = 64 * 1024 * 1024;

const splitNul = (s: string): string[] => s.split("\0").filter(Boolean);

const listProjectFiles = async (projectRoot: string): Promise<RepoFile[]> => {
	const { stdout: visibleStdout } = await exec(
		"git",
		["-C", projectRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
		{ maxBuffer: GIT_LS_BUFFER },
	);
	const { stdout: ignoredStdout } = await exec(
		"git",
		["-C", projectRoot, "ls-files", "-z", "-i", "--others", "--exclude-standard"],
		{ maxBuffer: GIT_LS_BUFFER },
	).catch(() => ({ stdout: "" }));

	const seen = new Set<string>();
	const out: RepoFile[] = [];
	for (const p of splitNul(visibleStdout)) {
		if (seen.has(p)) continue;
		seen.add(p);
		out.push({ path: p, size: 0, ignored: false });
	}
	for (const p of splitNul(ignoredStdout)) {
		if (seen.has(p)) continue;
		seen.add(p);
		out.push({ path: p, size: 0, ignored: true });
	}
	return out;
};

/** Accumulate file and directory entries from a single RepoFile under a childPrefix. */
// biome-ignore lint/complexity/useMaxParams: helper needs all 4 params to avoid closures
const accumulateEntry = (
	f: RepoFile,
	childPrefix: string,
	fileEntries: Map<string, ChildEntry>,
	dirIgnoredAll: Map<string, boolean>,
): void => {
	const rest = f.path.slice(childPrefix.length);
	const slashIdx = rest.indexOf("/");
	if (slashIdx === -1) {
		const entryPath = childPrefix + rest;
		if (!fileEntries.has(entryPath)) {
			fileEntries.set(entryPath, { path: entryPath, isDir: false, ignored: f.ignored });
		}
	} else {
		const dirName = rest.slice(0, slashIdx);
		const dirPath = childPrefix + dirName;
		const prevIgnored = dirIgnoredAll.get(dirPath);
		dirIgnoredAll.set(dirPath, prevIgnored === undefined ? f.ignored : prevIgnored && f.ignored);
	}
};

/**
 * Derive immediate children (files + sub-directory entries) for a given
 * `prefix` from a flat list of repo files.
 *
 * Rules:
 * - A file at `prefix/name` (no further slashes) → ChildEntry with isDir: false.
 * - A file at `prefix/dir/...` → a single ChildEntry for `prefix/dir` with isDir: true.
 * - A directory entry is `ignored: true` iff ALL its descendant files are ignored.
 * - Empty prefix means root level.
 */
export const deriveChildren = (files: readonly RepoFile[], prefix: string): ChildEntry[] => {
	const norm = prefix.replace(/\/+$/, "");
	const childPrefix = norm === "" ? "" : `${norm}/`;

	const fileEntries = new Map<string, ChildEntry>();
	const dirIgnoredAll = new Map<string, boolean>();

	for (const f of files) {
		if (f.path.startsWith(childPrefix)) {
			accumulateEntry(f, childPrefix, fileEntries, dirIgnoredAll);
		}
	}

	const result: ChildEntry[] = [];
	for (const [dirPath, allIgnored] of dirIgnoredAll) {
		result.push({ path: dirPath, isDir: true, ignored: allIgnored });
	}
	for (const entry of fileEntries.values()) {
		result.push(entry);
	}
	return result;
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
						try: () => listProjectFiles(root(projectId)),
						catch: () => new RepoError({ message: "git ls-files failed" }),
					}).pipe(Effect.orElseSucceed(() => [] as RepoFile[])),

				listFilesInPrefix: (projectId, prefix) =>
					Effect.tryPromise({
						try: async () => {
							const allFiles = await listProjectFiles(root(projectId));
							return deriveChildren(allFiles, prefix);
						},
						catch: () => new RepoError({ message: "git ls-files failed" }),
					}).pipe(Effect.orElseSucceed(() => [] as ChildEntry[])),

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

type RepoFileFixture = Omit<RepoFile, "ignored"> & { ignored?: boolean };

export const makeRepoServiceTest = (
	files: ReadonlyMap<string, RepoFileFixture[]>,
): Layer.Layer<RepoService> =>
	Layer.succeed(RepoService, {
		listFiles: (projectId) => {
			const entries = files.get(projectId) ?? [];
			const normalised: RepoFile[] = entries.map((f) => ({
				...f,
				ignored: typeof f.ignored === "boolean" ? f.ignored : false,
			}));
			return Effect.succeed(normalised);
		},
		listFilesInPrefix: (projectId, prefix) => {
			const entries = files.get(projectId) ?? [];
			const normalised: RepoFile[] = entries.map((f) => ({
				...f,
				ignored: typeof f.ignored === "boolean" ? f.ignored : false,
			}));
			return Effect.succeed(deriveChildren(normalised, prefix));
		},
		resolvePath: ({ projectId, path }) => Effect.succeed(`/test/${projectId}/${path}`),
		fileStat: () => Effect.succeed({ size: 0 }),
	});
