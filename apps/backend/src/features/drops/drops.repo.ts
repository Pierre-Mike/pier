import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";
import { MAX_DROP_BYTES, sanitizeDropName, uniqueDropPath } from "./drops.helpers.ts";

export type DroppedFile = { name: string; path: string; size: number };
export type DroppedFileWithMtime = { name: string; path: string; size: number; mtime: number };

const GITIGNORE_CONTENT = "*\n!.gitignore\n";

const ensureDropsDir = async (appRoot: string): Promise<string> => {
	const dropsDir = join(appRoot, "drops");
	await mkdir(dropsDir, { recursive: true });
	const ignorePath = join(dropsDir, ".gitignore");
	try {
		await access(ignorePath);
	} catch {
		await writeFile(ignorePath, GITIGNORE_CONTENT);
	}
	return dropsDir;
};

const saveFilesToDropsDir = async (dropsDir: string, files: File[]): Promise<DroppedFile[]> => {
	const saved: DroppedFile[] = [];
	for (const f of files) {
		if (!(f instanceof File)) continue;
		if (f.size > MAX_DROP_BYTES) throw new Error(`file too large: ${f.name}`);
		const safe = sanitizeDropName(f.name || "unnamed");
		const target = await uniqueDropPath(dropsDir, safe);
		const buf = Buffer.from(await f.arrayBuffer());
		await writeFile(target, buf);
		saved.push({ name: basename(target), path: target, size: f.size });
	}
	return saved;
};

const statFile = async (dir: string, name: string): Promise<DroppedFileWithMtime | null> => {
	if (name === ".gitignore") return null;
	const filePath = join(dir, name);
	try {
		const s = await stat(filePath);
		if (!s.isFile()) return null;
		return { name, path: filePath, size: s.size, mtime: s.mtimeMs };
	} catch {
		return null;
	}
};

const listDropsDir = async (appRoot: string): Promise<DroppedFileWithMtime[]> => {
	const dropsDir = join(appRoot, "drops");
	let entries: string[];
	try {
		entries = await readdir(dropsDir);
	} catch {
		return [];
	}
	const results: DroppedFileWithMtime[] = [];
	for (const name of entries) {
		const entry = await statFile(dropsDir, name);
		if (entry) results.push(entry);
	}
	return results.sort((a, b) => b.mtime - a.mtime);
};

export interface DropsServiceShape {
	readonly saveDropped: (args: { files: File[] }) => Effect.Effect<DroppedFile[], never, never>;
	readonly listDropped: () => Effect.Effect<DroppedFileWithMtime[], never, never>;
}

export const DropsService = Context.GenericTag<DropsServiceShape>("DropsService");

const makeDropsServiceImpl = (appRoot: string): DropsServiceShape => ({
	saveDropped: ({ files }) =>
		Effect.tryPromise({
			try: async () => {
				const dropsDir = await ensureDropsDir(appRoot);
				return saveFilesToDropsDir(dropsDir, files);
			},
			catch: () => [] as DroppedFile[],
		}).pipe(Effect.orElseSucceed(() => [] as DroppedFile[])),

	listDropped: () =>
		Effect.tryPromise({
			try: () => listDropsDir(appRoot),
			catch: () => [] as DroppedFileWithMtime[],
		}).pipe(Effect.orElseSucceed(() => [] as DroppedFileWithMtime[])),
});

export const makeDropsServiceLive = (): Layer.Layer<DropsServiceShape, never, ConfigService> =>
	Layer.effect(
		DropsService,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			return makeDropsServiceImpl(config.appRoot);
		}),
	);

/**
 * Test-only factory: creates a DropsService backed by a real filesystem root.
 * Used by drops.repo.test.ts integration tests.
 */
export const makeDropsServiceTest = (root: string): DropsServiceShape => makeDropsServiceImpl(root);
