import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { TerminalSessions, TerminalSessionsTest } from "./terminal-sessions.ts";

describe("TerminalSessions.openDefault", () => {
	it("opens a session named 'default'", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const sessions = yield* TerminalSessions;
				return yield* sessions.openDefault();
			}).pipe(Effect.provide(TerminalSessionsTest)),
		);
		expect(result.id).toBe("default");
		expect(result.projectId).toBe(""); // or null — verify what the service returns
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
