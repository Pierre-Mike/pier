/**
 * Gate: slice 2 — Per-project named zellij session with project.path as cwd
 *
 * Contract enforced by this file:
 *   - TerminalSessions.open(projectId) resolves the project via ProjectsService;
 *     unknown projectId → typed failure.
 *   - New session: zellij CLI is invoked with --session <sanitized> and cwd === project.path.
 *     Sanitized rule: replace(/[^a-zA-Z0-9_-]/g, "_") — exercised with an id containing
 *     characters the regex replaces so the assertion is non-trivial.
 *   - Existing session (same sanitized id): spawn is NOT called again (idempotency).
 *     Pinned by a counter on a fake spawn helper — open same project twice, assert
 *     spawn called exactly once.
 *
 * The injection surface expected from the implementer:
 *   - A ZellijSpawn Effect Context.Tag exporting { spawn(args, opts) }.
 *   - makeTerminalSessionsLive updated so it requires ProjectsService + ZellijSpawn
 *     in its Layer requirements, enabling test Layers to be composed below.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { makeProjectsServiceTest, type Project } from "./projects.ts";
import {
	makeTerminalSessionsLive,
	TerminalError,
	TerminalSessions,
	TerminalSessionsTest,
	ZellijSpawn,
	type ZellijSpawnService,
} from "./terminal-sessions.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_SIMPLE: Project = {
	id: "my-app",
	name: "my-app",
	path: "/home/user/projects/my-app",
	isGitRepo: true,
	lastModified: 1_000_000,
};

// Project whose id contains characters replaced by the sanitize rule.
// "my project!" → "my_project_"
const PROJECT_SPECIAL: Project = {
	id: "my project!",
	name: "my project!",
	path: "/home/user/projects/my-project",
	isGitRepo: false,
	lastModified: 900_000,
};

// ---------------------------------------------------------------------------
// Fake spawn helper — records every invocation without forking real processes
// ---------------------------------------------------------------------------

type SpawnCall = { args: string[]; cwd: string };

function makeSpawnRecorder(): {
	calls: SpawnCall[];
	layer: Layer.Layer<ZellijSpawnService>;
} {
	const calls: SpawnCall[] = [];
	const layer = Layer.succeed(ZellijSpawn, {
		spawn: (args: string[], opts: { cwd: string }) => {
			calls.push({ args, cwd: opts.cwd });
			return Effect.void;
		},
	});
	return { calls, layer };
}

// ---------------------------------------------------------------------------
// Helper: build a full test stack for slice-2 scenarios.
// Wires fake ProjectsService + fake ZellijSpawn into makeTerminalSessionsLive.
// ---------------------------------------------------------------------------

function makeTestStack(
	fixtures: readonly Project[],
	spawnLayer: Layer.Layer<ZellijSpawnService>,
): Layer.Layer<TerminalSessions> {
	const projectsLayer = makeProjectsServiceTest(fixtures);
	return Layer.provide(
		makeTerminalSessionsLive(),
		Layer.merge(projectsLayer, spawnLayer),
	) as unknown as Layer.Layer<TerminalSessions>;
}

// ---------------------------------------------------------------------------
// Slice 1 harness preserved (must not regress)
// ---------------------------------------------------------------------------

describe("TerminalSessionsTest (slice-1 shape preserved)", () => {
	it("open creates a new session", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("test-project");
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.projectId).toBe("test-project");
		expect(result.id).toMatch(/^test-project_[0-9a-f]{3}$/);
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
		expect(result.id).toBe("test_project_wit_c57");
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
// Slice 2 — AC1: project resolution via ProjectsService
// ---------------------------------------------------------------------------

describe("TerminalSessions.open — AC1: project resolution", () => {
	it("fails with a typed TerminalError when the projectId does not match any project", async () => {
		const { layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		const err = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions
					.open("does-not-exist")
					.pipe(Effect.catchAll((e) => Effect.succeed(e)));
			}).pipe(Effect.provide(stack)),
		);

		// Must be a typed error — TerminalError is the existing tagged error class.
		expect(err).toBeInstanceOf(TerminalError);
	});

	it("resolves successfully and returns a live session when the projectId is known", async () => {
		const { layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("my-app");
			}).pipe(Effect.provide(stack)),
		);

		expect(result.projectId).toBe("my-app");
		expect(result.status).toBe("live");
	});
});

// ---------------------------------------------------------------------------
// Slice 2 — AC2: spawn args + cwd pinning for a NEW session
// ---------------------------------------------------------------------------

describe("TerminalSessions.open — AC2: spawn args and cwd for new session", () => {
	it("invokes zellij with --session <sanitized-id> when opening a new session", async () => {
		const { calls, layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("my-app");
			}).pipe(Effect.provide(stack)),
		);

		expect(calls.length).toBeGreaterThanOrEqual(1);
		const [call] = calls;
		if (!call) throw new Error("Expected at least one spawn call");
		// Pin --session flag and its value in the args array.
		const sessionFlagIdx = call.args.indexOf("--session");
		expect(sessionFlagIdx).toBeGreaterThanOrEqual(0);
		expect(call.args[sessionFlagIdx + 1]).toMatch(/^my-app_[0-9a-f]{3}$/);
	});

	it("passes cwd equal to project.path — not the daemon's own cwd", async () => {
		const { calls, layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("my-app");
			}).pipe(Effect.provide(stack)),
		);

		expect(calls.length).toBeGreaterThanOrEqual(1);
		const [call] = calls;
		if (!call) throw new Error("Expected at least one spawn call");
		// Must equal the exact project.path string, not just any string.
		expect(call.cwd).toBe(PROJECT_SIMPLE.path);
	});

	it("sanitizes a project id with special chars before using it as --session arg", async () => {
		const { calls, layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SPECIAL], spawnLayer);

		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.open("my project!");
			}).pipe(Effect.provide(stack)),
		);

		expect(calls.length).toBeGreaterThanOrEqual(1);
		const [call] = calls;
		if (!call) throw new Error("Expected at least one spawn call");
		const sessionFlagIdx = call.args.indexOf("--session");
		expect(sessionFlagIdx).toBeGreaterThanOrEqual(0);
		// "my project!" → "my_project__<hash>" per sanitizeSessionId.
		expect(call.args[sessionFlagIdx + 1]).toMatch(/^my_project__[0-9a-f]{3}$/);
		// cwd must be the real project.path, not the sanitized session name.
		expect(call.cwd).toBe(PROJECT_SPECIAL.path);
	});
});

// ---------------------------------------------------------------------------
// Slice 2 — AC3: idempotency — existing live session must NOT re-spawn
// ---------------------------------------------------------------------------

describe("TerminalSessions.open — AC3: idempotency for existing sessions", () => {
	it("calls spawn exactly once when open() is called twice for the same project", async () => {
		const { calls, layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				// First open — session is new, should spawn.
				yield* sessions.open("my-app");
				// Second open for the same project — must reuse, must NOT re-spawn.
				yield* sessions.open("my-app");
			}).pipe(Effect.provide(stack)),
		);

		// Counter proof: exactly one spawn invocation across both open() calls.
		expect(calls.length).toBe(1);
	});

	it("returns a live session on the second open without re-spawning", async () => {
		const { calls, layer: spawnLayer } = makeSpawnRecorder();
		const stack = makeTestStack([PROJECT_SIMPLE], spawnLayer);

		const [first, second] = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				const a = yield* sessions.open("my-app");
				const b = yield* sessions.open("my-app");
				return [a, b] as const;
			}).pipe(Effect.provide(stack)),
		);

		expect(first.id).toBe(second.id);
		expect(first.status).toBe("live");
		expect(second.status).toBe("live");
		// Belt-and-suspenders: still only one spawn.
		expect(calls.length).toBe(1);
	});
});
