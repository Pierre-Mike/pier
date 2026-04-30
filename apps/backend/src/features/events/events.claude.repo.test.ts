import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { ClaudeEventStream, ClaudeEventStreamTest } from "./events.claude.repo.ts";

describe("ClaudeEventStreamTest", () => {
	it("start is idempotent", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const stream = yield* ClaudeEventStream;
				yield* stream.start();
				yield* stream.start();
			}).pipe(Effect.provide(ClaudeEventStreamTest)),
		);
	});

	it("readHistory returns empty array", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const stream = yield* ClaudeEventStream;
				return yield* stream.readHistory({ limit: 100 });
			}).pipe(Effect.provide(ClaudeEventStreamTest)),
		);
		expect(result).toEqual([]);
	});

	it("readHistory respects project filter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const stream = yield* ClaudeEventStream;
				return yield* stream.readHistory({ project: "test-project", limit: 100 });
			}).pipe(Effect.provide(ClaudeEventStreamTest)),
		);
		expect(result).toEqual([]);
	});

	it("readHistory respects session filter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const stream = yield* ClaudeEventStream;
				return yield* stream.readHistory({ session: "test-session", limit: 100 });
			}).pipe(Effect.provide(ClaudeEventStreamTest)),
		);
		expect(result).toEqual([]);
	});

	it("readHistory respects limit", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const stream = yield* ClaudeEventStream;
				return yield* stream.readHistory({ limit: 10 });
			}).pipe(Effect.provide(ClaudeEventStreamTest)),
		);
		expect(result).toEqual([]);
	});
});
