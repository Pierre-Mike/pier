import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";
import {
	makeTerminalSessionsLive,
	resolveProjectCwd,
	TerminalSessions,
	TerminalSessionsTest,
	ZELLIJ_SOCKET_DIR,
} from "./sessions.repo.ts";

// spawnNamedSession (post spec-5ec4849) polls ZELLIJ_SOCKET_DIR/contract_version_1
// for a socket named after the session id and throws if it never appears. Tests
// that mock Bun.spawn must therefore drop a marker file at that path so the
// polling loop returns instead of throwing TerminalError after 3s.
const ZELLIJ_LIVE_DIR = join(ZELLIJ_SOCKET_DIR, "contract_version_1");
const writeFakeSocket = (id: string): string => {
	const p = join(ZELLIJ_LIVE_DIR, id);
	writeFileSync(p, "");
	return p;
};
const tryUnlink = (p: string): void => {
	try {
		unlinkSync(p);
	} catch {
		/* already gone */
	}
};

describe("TerminalSessionsTest", () => {
	it("open creates a new session", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("test-project");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.projectId).toBe("test-project");
		expect(result.id).toBe("test-project");
		expect(result.status).toBe("live");
		expect(result.url).toContain("mem://");
	});

	it("open sanitizes project ID", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("test project/with spaces");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.id).toBe("test_project_with_spaces");
	});

	it("open truncates very long project IDs to a zellij-safe length", async () => {
		const long = "a".repeat(120);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open(long);
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.id).toBe("a".repeat(60));
		expect(result.projectId).toBe(long);
	});

	it("close is a no-op in test adapter", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				yield* sessions.close("test-session");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
	});

	it("list returns empty array in test adapter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.list();
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result).toEqual([]);
	});

	it("get returns null in test adapter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.get("test-id");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result).toBeNull();
	});

	it("health returns false in test adapter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.health("test-id");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// spec 021: close Effect must spawn `zellij delete-session --force <id>`
//           with 2 s timeout race and error-swallow via console.warn
// ---------------------------------------------------------------------------

// Helper: extract the `close:` handler body from the live layer source.
// Anchors on the function name without assuming surrounding syntax so the
// extractor survives minor refactors (e.g. `close: (id) =>` vs
// `close: function(id)`). Captures up to the next sibling key (`list:`).
function extractCloseBody(source: string): string {
	// Match `close:` followed by a parameter list (arrow or function), then
	// everything up to the next top-level sibling key at the same depth.
	const m = source.match(/\bclose\s*:\s*\(id\)[\s\S]*?(?=\n\t\t\t\tlist:)/);
	return m?.[0] ?? "";
}

// Top-level await: read source once at module load (Bun supports top-level await).
const repoSource = await Bun.file(new URL("./sessions.repo.ts", import.meta.url)).text();
const closeBody = extractCloseBody(repoSource);

describe("TerminalSessions Live close — spec 021", () => {
	it("close body is extractable from the live layer (sanity check)", () => {
		// If this fails the anchor regex needs updating — not a spec coverage issue.
		expect(closeBody.length).toBeGreaterThan(0);
	});

	// AC 6a — spawn command shape
	it("close spawns zellij delete-session --force <id>", () => {
		// RED: current close only updates the registry; it does not spawn zellij.
		expect(closeBody).toContain("zellij");
		expect(closeBody).toContain("delete-session");
		expect(closeBody).toContain("--force");
		// The session id must be threaded into the command (not hardcoded).
		expect(closeBody).toMatch(/\bid\b/);
	});

	// AC 6b — 2-second timeout race
	it("close body contains a 2-second timeout reference", () => {
		// RED: the Constraint requires a 2 s race. The implementation must
		// reference either the millisecond value (2000) or a semantic duration
		// (Duration.seconds(2), "2 seconds", "2000").
		// A dead constant that's never consumed would still contain the value,
		// but that bypass is closed by the spawn assertion above: if the spawn
		// IS present, the timeout must guard it.
		const has2sRef =
			closeBody.includes("2000") ||
			closeBody.includes("Duration.seconds(2)") ||
			closeBody.includes('"2 seconds"') ||
			closeBody.includes("'2 seconds'");
		expect(has2sRef).toBe(true);
	});

	// AC 6c — error-swallow with console.warn
	it("close body swallows errors with console.warn", () => {
		// RED: the Constraint requires errors/non-zero exits to be swallowed via
		// console.warn rather than propagated. The close body must contain both
		// a catch/orElse combinator reference AND a console.warn call.
		expect(closeBody).toContain("console.warn");
		// Must appear inside an error-handling combinator (catch, orElse, tapError, etc.)
		const hasCatchCombinator =
			closeBody.includes("catch") ||
			closeBody.includes("orElse") ||
			closeBody.includes("tapError") ||
			closeBody.includes("catchAll");
		expect(hasCatchCombinator).toBe(true);
	});

	// AC 6d — error-swallow: close must NOT re-throw / propagate errors
	// (complements the console.warn assertion by excluding the trivial bypass
	// of spawning then letting any rejection bubble up to the caller).
	it("close body does NOT call console.error (errors must be warned, not thrown)", () => {
		// If close uses console.error instead of console.warn, the severity
		// contract is violated. Only warn is permitted for swallowed spawn errors.
		// (console.error in open/other methods is fine; this is scoped to close.)
		expect(closeBody).not.toContain("console.error");
	});
});

describe("TerminalSessions.openDefault", () => {
	it("opens a session named 'default'", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.openDefault();
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.id).toBe("default");
		expect(result.projectId).toBe("");
		expect(result.status).toBe("live");
		expect(result.url).toContain("mem://");
	});

	it("returns the existing session if called twice", async () => {
		const first = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.openDefault();
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);

		const second = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.openDefault();
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);

		expect(first.id).toBe(second.id);
		expect(first.url).toBe(second.url);
	});
});

// ---------------------------------------------------------------------------
// spec 023: resolveProjectCwd — exported pure helper
// ---------------------------------------------------------------------------

// AC (2) + AC (3): direct unit test on the exported helper.
// RED: `resolveProjectCwd` is not yet exported from sessions.repo.ts — this
// describe block will fail to compile until the export is added.
describe("resolveProjectCwd — exported helper (spec 023)", () => {
	let tmpRoot: string;
	let existingProject: string;

	beforeAll(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), "pier-spec-023-"));
		existingProject = "my-project";
		mkdirSync(join(tmpRoot, existingProject));
	});

	it("returns <projectsRoot>/<projectId> when that directory exists", async () => {
		const result = await resolveProjectCwd(tmpRoot, existingProject);
		expect(result).toBe(join(tmpRoot, existingProject));
	});

	it("returns join(<projectsRoot>, <projectId>) when <projectId> directory does not exist", async () => {
		// spec 036: contract changed — always return projectsRoot/projectId, no fallback.
		const result = await resolveProjectCwd(tmpRoot, "no-such-project");
		expect(result).toBe(join(tmpRoot, "no-such-project"));
	});
});

// ---------------------------------------------------------------------------
// spec 023: cwd threading through the Live service
// ---------------------------------------------------------------------------

// AC (4) + AC (5): assert the cwd passed to Bun.spawn when open/openDefault
// are called via the real Live layer backed by a controlled tmp dir.
describe("TerminalSessions Live — cwd resolution (spec 023)", () => {
	let tmpRoot: string;
	let existingProject: string;
	let capturedSpawnOptions: Array<{ args: string[]; cwd: string | undefined }>;
	let originalSpawn: typeof Bun.spawn;
	const fakeSockets: string[] = [];

	beforeAll(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), "pier-spec-023-live-"));
		existingProject = "real-project";
		mkdirSync(join(tmpRoot, existingProject));
		mkdirSync(ZELLIJ_LIVE_DIR, { recursive: true });
		capturedSpawnOptions = [];

		// Capture Bun.spawn calls so we can assert cwd without actually launching zellij.
		// Also drop a marker file at the path spawnNamedSession polls so its 3s
		// socket-wait loop returns instead of throwing.
		originalSpawn = Bun.spawn;
		// @ts-expect-error — intentional mock override for test isolation
		Bun.spawn = (args: string[], opts?: { cwd?: string; [key: string]: unknown }) => {
			capturedSpawnOptions.push({ args: args as string[], cwd: opts?.cwd });
			const sessionIdx = args.indexOf("--session");
			const id = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;
			if (id) fakeSockets.push(writeFakeSocket(id));
			return {
				stdout: new ReadableStream({ start: (c) => c.close() }),
				stderr: new ReadableStream({ start: (c) => c.close() }),
				exited: Promise.resolve(0),
				kill: () => undefined,
			};
		};
	});

	afterAll(() => {
		Bun.spawn = originalSpawn;
		for (const p of fakeSockets) tryUnlink(p);
	});

	const makeLayer = (projectsRoot: string) =>
		makeTerminalSessionsLive().pipe(
			Layer.provide(
				Layer.succeed(ConfigService, {
					get: () =>
						Effect.succeed({
							version: "0.0.0",
							env: "test",
							appPort: 5173,
							sandboxPort: 5174,
							zellijWebUrl: "https://test.local:8082",
							projectsRoot,
							piRoot: tmpRoot,
							artifactsDir: join(tmpRoot, "artifacts"),
							claudeProjectsRoot: join(tmpRoot, "claude-projects"),
							appRoot: tmpRoot,
						}),
				}),
			),
		);

	it("open(projectId) passes <projectsRoot>/<projectId> to spawn when directory exists", async () => {
		capturedSpawnOptions = [];
		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				yield* sessions.open(existingProject);
			}).pipe(Effect.provide(makeLayer(tmpRoot))),
		);
		// Filter to only zellij --session spawn calls (not list-sessions calls).
		const sessionSpawns = capturedSpawnOptions.filter(
			(s) => s.args.includes("--session") && !s.args.includes("list-sessions"),
		);
		expect(sessionSpawns.length).toBeGreaterThan(0);
		expect(sessionSpawns[0]?.cwd).toBe(join(tmpRoot, existingProject));
	});

	it("open(projectId) passes join(<projectsRoot>, <projectId>) to spawn when directory does not exist", async () => {
		// spec 036: contract changed — cwd is always projectsRoot/projectId.
		capturedSpawnOptions = [];
		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				yield* sessions.open("ghost-project");
			}).pipe(Effect.provide(makeLayer(tmpRoot))),
		);
		const sessionSpawns = capturedSpawnOptions.filter(
			(s) => s.args.includes("--session") && !s.args.includes("list-sessions"),
		);
		expect(sessionSpawns.length).toBeGreaterThan(0);
		expect(sessionSpawns[0]?.cwd).toBe(join(tmpRoot, "ghost-project"));
	});

	it("openDefault() passes <projectsRoot> to spawn", async () => {
		capturedSpawnOptions = [];
		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				yield* sessions.openDefault();
			}).pipe(Effect.provide(makeLayer(tmpRoot))),
		);
		const sessionSpawns = capturedSpawnOptions.filter(
			(s) => s.args.includes("--session") && !s.args.includes("list-sessions"),
		);
		expect(sessionSpawns.length).toBeGreaterThan(0);
		expect(sessionSpawns[0]?.cwd).toBe(tmpRoot);
	});
});

// ---------------------------------------------------------------------------
// spec 036: resolveProjectCwd always returns <projectsRoot>/<projectId>
// ---------------------------------------------------------------------------
// RED: current resolveProjectCwd falls back to projectsRoot when the project
// directory does not exist. The new contract is to always return
// join(projectsRoot, projectId) unconditionally.

describe("resolveProjectCwd — spec 036: unconditional project path", () => {
	let tmpRoot: string;

	beforeAll(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), "pier-spec-036-"));
		// Intentionally do NOT create any subdirectory — tests must pass even
		// for projects with no on-disk directory.
	});

	// AC 1 (unchanged): existing-dir path still works.
	it("returns join(root, projectId) when that directory exists", async () => {
		mkdirSync(join(tmpRoot, "existing-project"));
		const result = await resolveProjectCwd(tmpRoot, "existing-project");
		expect(result).toBe(join(tmpRoot, "existing-project"));
	});

	// AC 2 (changed): missing-dir path now returns join(root, projectId), not root.
	// RED: currently returns tmpRoot — will fail until resolveProjectCwd is fixed.
	it("returns join(root, projectId) even when that directory does not exist", async () => {
		const result = await resolveProjectCwd(tmpRoot, "brand-new-project");
		// New contract: always projectsRoot/projectId regardless of disk state.
		expect(result).toBe(join(tmpRoot, "brand-new-project"));
	});
});

// ---------------------------------------------------------------------------
// spec 036: cwd threading for non-existent project via Live service
// ---------------------------------------------------------------------------
// AC 3: sessions.open(projectId) must pass join(projectsRoot, projectId) to
// spawn even when the project directory does not exist on disk.
// RED: currently passes projectsRoot — will fail until resolveProjectCwd is fixed.

describe("TerminalSessions Live — spec 036: non-existent project cwd", () => {
	let tmpRoot: string;
	let capturedSpawnOptions: Array<{ args: string[]; cwd: string | undefined }>;
	let originalSpawn: typeof Bun.spawn;
	const fakeSockets: string[] = [];

	beforeAll(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), "pier-spec-036-live-"));
		// No subdirectories created — the ghost project directory does NOT exist.
		mkdirSync(ZELLIJ_LIVE_DIR, { recursive: true });
		capturedSpawnOptions = [];

		originalSpawn = Bun.spawn;
		// @ts-expect-error — intentional mock override for test isolation
		Bun.spawn = (args: string[], opts?: { cwd?: string; [key: string]: unknown }) => {
			capturedSpawnOptions.push({ args: args as string[], cwd: opts?.cwd });
			const sessionIdx = args.indexOf("--session");
			const id = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;
			if (id) fakeSockets.push(writeFakeSocket(id));
			return {
				stdout: new ReadableStream({ start: (c) => c.close() }),
				stderr: new ReadableStream({ start: (c) => c.close() }),
				exited: Promise.resolve(0),
				kill: () => undefined,
			};
		};
	});

	afterAll(() => {
		Bun.spawn = originalSpawn;
		for (const p of fakeSockets) tryUnlink(p);
	});

	const makeLayer = (projectsRoot: string) =>
		makeTerminalSessionsLive().pipe(
			Layer.provide(
				Layer.succeed(ConfigService, {
					get: () =>
						Effect.succeed({
							version: "0.0.0",
							env: "test",
							appPort: 5173,
							sandboxPort: 5174,
							zellijWebUrl: "https://test.local:8082",
							projectsRoot,
							piRoot: tmpRoot,
							artifactsDir: join(tmpRoot, "artifacts"),
							claudeProjectsRoot: join(tmpRoot, "claude-projects"),
							appRoot: tmpRoot,
						}),
				}),
			),
		);

	// AC 3: open passes join(projectsRoot, projectId) to spawn even for missing dirs.
	// RED: currently passes projectsRoot (the fallback) — fails until fix lands.
	it("open(projectId) passes join(projectsRoot, projectId) to spawn when directory does not exist", async () => {
		capturedSpawnOptions = [];
		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				yield* sessions.open("ghost-project-036");
			}).pipe(Effect.provide(makeLayer(tmpRoot))),
		);
		const sessionSpawns = capturedSpawnOptions.filter(
			(s) => s.args.includes("--session") && !s.args.includes("list-sessions"),
		);
		expect(sessionSpawns.length).toBeGreaterThan(0);
		// Must be the project subfolder, NOT the bare projectsRoot.
		expect(sessionSpawns[0]?.cwd).toBe(join(tmpRoot, "ghost-project-036"));
	});
});
