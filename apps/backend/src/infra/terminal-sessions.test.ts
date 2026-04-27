import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { TerminalSessions, TerminalSessionsTest } from "./terminal-sessions.ts";

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
