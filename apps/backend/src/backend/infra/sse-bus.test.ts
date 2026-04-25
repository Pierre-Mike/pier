import { describe, expect, it } from "bun:test";
import { Duration, Effect, Fiber, Stream } from "effect";
import {
	ArtifactBus,
	EventBus,
	makeArtifactBusLive,
	makeEventBusLive,
	makeReloadBusLive,
	ReloadBus,
} from "./sse-bus.ts";

describe("ArtifactBus", () => {
	it("emits events to subscribers", async () => {
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const bus = yield* ArtifactBus;
					const stream = yield* bus.subscribe();
					const collected: unknown[] = [];
					const fiber = yield* Effect.fork(
						Stream.runForEach(stream, (evt) => Effect.sync(() => collected.push(evt))),
					);
					yield* Effect.sleep(Duration.millis(10));
					yield* bus.emit({ kind: "add", artifact: null, id: "test" });
					yield* Effect.sleep(Duration.millis(50));
					yield* Fiber.interrupt(fiber);
					expect(collected).toHaveLength(1);
				}),
			).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});

	it("keeps no history (0 retention)", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* ArtifactBus;
				yield* bus.emit({ kind: "add", artifact: null, id: "test1" });
				yield* bus.emit({ kind: "change", artifact: null, id: "test2" });
				const h = yield* bus.history();
				expect(h).toHaveLength(0);
			}).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});

	it("supports multi-subscriber fanout", async () => {
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const bus = yield* ArtifactBus;
					const stream1 = yield* bus.subscribe();
					const stream2 = yield* bus.subscribe();
					const collected1: unknown[] = [];
					const collected2: unknown[] = [];
					const f1 = yield* Effect.fork(
						Stream.runForEach(stream1, (e) => Effect.sync(() => collected1.push(e))),
					);
					const f2 = yield* Effect.fork(
						Stream.runForEach(stream2, (e) => Effect.sync(() => collected2.push(e))),
					);
					yield* Effect.sleep(Duration.millis(10));
					yield* bus.emit({ kind: "unlink", artifact: null, id: "x" });
					yield* Effect.sleep(Duration.millis(50));
					yield* Fiber.interrupt(f1);
					yield* Fiber.interrupt(f2);
					expect(collected1).toHaveLength(1);
					expect(collected2).toHaveLength(1);
				}),
			).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});

	it("late subscriber gets nothing (no replay)", async () => {
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const bus = yield* ArtifactBus;
					yield* bus.emit({ kind: "add", artifact: null, id: "early" });
					yield* Effect.sleep(Duration.millis(20));
					const stream = yield* bus.subscribe();
					const collected: unknown[] = [];
					const fiber = yield* Effect.fork(
						Stream.runForEach(stream, (evt) => Effect.sync(() => collected.push(evt))),
					);
					yield* Effect.sleep(Duration.millis(50));
					yield* Fiber.interrupt(fiber);
					expect(collected).toHaveLength(0);
				}),
			).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});
});

describe("EventBus", () => {
	it("retains 2000 events in history", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* EventBus;
				for (let i = 0; i < 2500; i++) {
					yield* bus.emit({ ts: i, project: "test", kind: "test" });
				}
				const h = yield* bus.history();
				expect(h).toHaveLength(2000);
				const first = h[0];
				if (!first) throw new Error("expected first element");
				expect(first.ts).toBe(500);
			}).pipe(Effect.provide(makeEventBusLive())),
		);
	});

	it("emits to subscribers", async () => {
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const bus = yield* EventBus;
					const stream = yield* bus.subscribe();
					const collected: unknown[] = [];
					const fiber = yield* Effect.fork(
						Stream.runForEach(stream, (evt) => Effect.sync(() => collected.push(evt))),
					);
					yield* Effect.sleep(Duration.millis(10));
					yield* bus.emit({ ts: 123, project: "p", kind: "k" });
					yield* Effect.sleep(Duration.millis(50));
					yield* Fiber.interrupt(fiber);
					expect(collected).toHaveLength(1);
				}),
			).pipe(Effect.provide(makeEventBusLive())),
		);
	});
});

describe("ReloadBus", () => {
	it("keeps no history (0 retention)", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* ReloadBus;
				yield* bus.emit("reload1");
				yield* bus.emit("reload2");
				const h = yield* bus.history();
				expect(h).toHaveLength(0);
			}).pipe(Effect.provide(makeReloadBusLive())),
		);
	});

	it("emits to subscribers", async () => {
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const bus = yield* ReloadBus;
					const stream = yield* bus.subscribe();
					const collected: unknown[] = [];
					const fiber = yield* Effect.fork(
						Stream.runForEach(stream, (evt) => Effect.sync(() => collected.push(evt))),
					);
					yield* Effect.sleep(Duration.millis(10));
					yield* bus.emit("reload-signal");
					yield* Effect.sleep(Duration.millis(50));
					yield* Fiber.interrupt(fiber);
					expect(collected).toEqual(["reload-signal"]);
				}),
			).pipe(Effect.provide(makeReloadBusLive())),
		);
	});
});
