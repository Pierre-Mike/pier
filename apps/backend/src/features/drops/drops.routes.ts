import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { defaultConfigLayer, makeConfigLayer } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, routeAdvanced } from "../../platform/route-kit.ts";
import {
	makeTerminalSessionsLive,
	TerminalSessions,
	TerminalSessionsTest,
} from "../sessions/sessions.repo.ts";
import { MAX_DROP_BYTES, sanitizeDropName, uniqueDropPath } from "./drops.helpers.ts";
import { makeDropsServiceLive } from "./drops.repo.ts";

const shellQuote = (s: string): string => {
	if (/^[A-Za-z0-9_\-./~]+$/.test(s)) return s;
	return `'${s.replace(/'/g, "'\\''")}'`;
};

type SavedFile = { name: string; path: string; size: number };
type SaveResult = { ok: true; files: SavedFile[] } | { ok: false; error: string };

const saveFilesToDisk = (files: File[], appRoot: string): Effect.Effect<SaveResult, never, never> =>
	Effect.promise(async () => {
		const dropsDir = join(appRoot, "drops");
		try {
			await mkdir(dropsDir, { recursive: true });
			const ignorePath = join(dropsDir, ".gitignore");
			try {
				await access(ignorePath);
			} catch {
				await writeFile(ignorePath, "*\n!.gitignore\n");
			}
			const saved: SavedFile[] = [];
			for (const f of files) {
				if (f.size > MAX_DROP_BYTES) {
					return { ok: false as const, error: `file too large: ${f.name}` };
				}
				const safe = sanitizeDropName(f.name || "unnamed");
				const target = await uniqueDropPath(dropsDir, safe);
				const buf = Buffer.from(await f.arrayBuffer());
				await writeFile(target, buf);
				saved.push({ name: basename(target), path: target, size: f.size });
			}
			return { ok: true as const, files: saved };
		} catch (e) {
			const msg = e instanceof Error ? e.message : "save failed";
			return { ok: false as const, error: msg };
		}
	});

// ---------------------------------------------------------------------------
// POST /api/drops
// ---------------------------------------------------------------------------

export const dropsPostHandler = (
	c: Context<{ Bindings: AppBindings }>,
): Effect.Effect<Response, never, TerminalSessions> =>
	Effect.gen(function* () {
		let bodyRaw: Record<string, unknown>;
		try {
			bodyRaw = (yield* Effect.promise(() => c.req.parseBody({ all: true }))) as Record<
				string,
				unknown
			>;
		} catch {
			return c.json({ error: "bad form body" }, 400);
		}

		const activeProjectId = bodyRaw["activeProjectId"];
		if (typeof activeProjectId !== "string" || !activeProjectId) {
			return c.json({ error: "no active project" }, 400);
		}

		const raw = bodyRaw["files"] ?? [];
		const files = (Array.isArray(raw) ? raw : [raw]).filter((x): x is File => x instanceof File);
		if (files.length === 0) return c.json({ error: "no files" }, 400);

		// Resolve appRoot from env override or process.cwd()
		const appRoot = process.env["PIGUY_APP_ROOT"] ?? process.cwd();
		const saveResult = yield* saveFilesToDisk(files, appRoot);

		if (!saveResult.ok) {
			return c.json({ error: saveResult.error }, 400);
		}

		const saved = saveResult.files;
		const text = `${saved.map((f) => shellQuote(f.path)).join(" ")} `;
		const terminal = yield* TerminalSessions;
		const { injected } = yield* terminal.writeChars({ projectId: activeProjectId, text });
		return c.json({ files: saved.map((f) => ({ ...f, injected })) }, 200);
	});

// ---------------------------------------------------------------------------
// GET /api/drops
// ---------------------------------------------------------------------------

export const dropsGetHandler = (
	c: Context<{ Bindings: AppBindings }>,
): Effect.Effect<Response, never, never> =>
	Effect.promise(async () => {
		const appRoot = process.env["PIGUY_APP_ROOT"] ?? process.cwd();
		const dropsDir = join(appRoot, "drops");
		let entries: string[];
		try {
			entries = await readdir(dropsDir);
		} catch {
			return c.json([], 200);
		}
		const results: Array<{ name: string; path: string; size: number; mtime: number }> = [];
		for (const name of entries) {
			if (name === ".gitignore") continue;
			const filePath = join(dropsDir, name);
			try {
				const s = await stat(filePath);
				if (s.isFile()) {
					results.push({ name, path: filePath, size: s.size, mtime: s.mtimeMs });
				}
			} catch {
				// skip
			}
		}
		results.sort((a, b) => b.mtime - a.mtime);
		return c.json(results, 200);
	});

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

const postRoute = routeAdvanced({
	liveDeps: Layer.mergeAll(
		Layer.provide(makeDropsServiceLive(), defaultConfigLayer),
		Layer.provide(makeTerminalSessionsLive(), defaultConfigLayer),
	),
	testDeps: Layer.merge(
		Layer.provide(makeDropsServiceLive(), makeConfigLayer({})),
		TerminalSessionsTest,
	),
	handler: dropsPostHandler,
});

const getRoute = routeAdvanced({
	liveDeps: defaultConfigLayer,
	testDeps: defaultConfigLayer,
	handler: dropsGetHandler,
});

const app = new Hono<{ Bindings: AppBindings }>()
	.post("/api/drops", postRoute.live)
	.get("/api/drops", getRoute.live);

const testApp = new Hono<{ Bindings: AppBindings }>()
	.post("/api/drops", postRoute.test)
	.get("/api/drops", getRoute.test);

export const dropsRoute = { app, testApp } satisfies RouteModule<typeof app>;
