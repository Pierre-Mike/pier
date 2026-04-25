import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { ArtifactWatcher, ArtifactWatcherTest } from "./artifact-watcher.ts";

describe("ArtifactWatcherTest", () => {
	it("start is idempotent", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const watcher = yield* ArtifactWatcher;
				yield* watcher.start();
				yield* watcher.start();
			}).pipe(Effect.provide(ArtifactWatcherTest)),
		);
	});

	it("list returns empty array", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const watcher = yield* ArtifactWatcher;
				return yield* watcher.list();
			}).pipe(Effect.provide(ArtifactWatcherTest)),
		);
		expect(result).toEqual([]);
	});

	it("list respects project filter", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const watcher = yield* ArtifactWatcher;
				return yield* watcher.list({ project: "test-project" });
			}).pipe(Effect.provide(ArtifactWatcherTest)),
		);
		expect(result).toEqual([]);
	});

	it("list respects limit", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const watcher = yield* ArtifactWatcher;
				return yield* watcher.list({ limit: 10 });
			}).pipe(Effect.provide(ArtifactWatcherTest)),
		);
		expect(result).toEqual([]);
	});
});
