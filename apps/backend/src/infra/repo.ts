import { execFile } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "../platform/config.repo.ts";

const exec = promisify(execFile);

export type RepoFile = { path: string; size: number };
export type DroppedFile = { name: string; path: string; size: number };

export class RepoError extends Data.TaggedError("RepoError")<{ message: string }> {}

export interface RepoService {
	readonly listFiles: (projectId: string) => Effect.Effect<RepoFile[], RepoError, never>;
	readonly resolvePath: (args: {
		projectId: string;
		path: string;
	}) => Effect.Effect<string, RepoError, never>;
	readonly fileStat: (absPath: string) => Effect.Effect<{ size: number }, RepoError, never>;
	readonly saveDropped: (args: {
		projectId: string;
		files: File[];
	}) => Effect.Effect<DroppedFile[], RepoError, never>;
}

export const RepoService = Context.GenericTag<RepoService>("RepoService");

const MAX_DROP_BYTES = 100 * 1024 * 1024;

const projectRootFor = (projectsRoot: string, id: string): string => {
	if (!id || id.includes("..") || id.includes("/") || id.startsWith(".")) {
		throw new Error("bad project id");
	}
	return join(projectsRoot, id);
};

const stripControlBytes = (s: string): string => {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) >= 0x20) out += s[i];
	}
	return out;
};

const sanitizeDropName = (raw: string): string => {
	const stripped = basename(stripControlBytes(raw)).replace(/[/\\]/g, "_");
	let n = stripped;
	if (!n || n === "." || n === "..") n = "unnamed";
	if (n.length > 180) {
		const ext = extname(n);
		n = n.slice(0, 180 - ext.length) + ext;
	}
	return n;
};

const uniqueDropPath = async (dir: string, name: string): Promise<string> => {
	const candidate = join(dir, name);
	try {
		await access(candidate);
	} catch {
		return candidate;
	}
	const ext = extname(name);
	const stem = ext ? name.slice(0, -ext.length) : name;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return join(dir, `${stem}-${stamp}${ext}`);
};

const ensureDropsDir = async (root: string): Promise<string> => {
	const dropsDir = join(root, ".pier", "drops");
	await mkdir(dropsDir, { recursive: true });
	const ignorePath = join(dropsDir, ".gitignore");
	try {
		await access(ignorePath);
	} catch {
		await writeFile(ignorePath, "*\n!.gitignore\n");
	}
	return dropsDir;
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

				saveDropped: ({ projectId, files }) =>
					Effect.tryPromise({
						try: async () => {
							const r = root(projectId);
							const dropsDir = await ensureDropsDir(r);
							const saved: DroppedFile[] = [];
							for (const f of files) {
								if (!(f instanceof File)) continue;
								if (f.size > MAX_DROP_BYTES) {
									throw new Error(`file too large: ${f.name}`);
								}
								const safe = sanitizeDropName(f.name || "unnamed");
								const target = await uniqueDropPath(dropsDir, safe);
								const buf = Buffer.from(await f.arrayBuffer());
								await writeFile(target, buf);
								saved.push({ name: basename(target), path: target, size: f.size });
							}
							return saved;
						},
						catch: (e) => new RepoError({ message: (e as Error).message }),
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
		saveDropped: ({ files: dropped }) =>
			Effect.succeed(
				dropped.map((f) => ({ name: f.name, path: `/test/.pier/drops/${f.name}`, size: f.size })),
			),
	});
