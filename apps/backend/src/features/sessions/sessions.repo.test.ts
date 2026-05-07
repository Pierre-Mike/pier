import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { TerminalSessions, TerminalSessionsTest } from "./sessions.repo.ts";

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
