import { beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
	ArtifactBus,
	artifactBusInstance,
	EventBus,
	eventBusInstance,
	makeArtifactBusLive,
	makeEventBusLive,
	makeReloadBusLive,
	ReloadBus,
	reloadBusInstance,
} from "./sse-bus.ts";

const resetSingletons = (): void => {
	for (const bus of [artifactBusInstance, eventBusInstance, reloadBusInstance]) {
		// reach in and clear without exposing a public API: each bus owns its
		// own subs Set and history Array; rebuild via emit-then-drain pattern
		// would be wasteful, so reach via known shape.
		const ref = bus as unknown as {
			subs: Set<unknown>;
			history: unknown[];
		};
		ref.subs.clear();
		ref.history.length = 0;
	}
};

describe("ArtifactBus (Effect Layer)", () => {
	beforeEach(resetSingletons);

	it("emits events to imperative subscribers", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* ArtifactBus;
				const collected: unknown[] = [];
				yield* bus.subscribe((evt) => collected.push(evt));
				yield* bus.emit({ kind: "add", artifact: null, id: "test" });
				expect(collected).toHaveLength(1);
			}).pipe(Effect.provide(makeArtifactBusLive())),
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
			Effect.gen(function* () {
				const bus = yield* ArtifactBus;
				const c1: unknown[] = [];
				const c2: unknown[] = [];
				yield* bus.subscribe((e) => c1.push(e));
				yield* bus.subscribe((e) => c2.push(e));
				yield* bus.emit({ kind: "unlink", artifact: null, id: "x" });
				expect(c1).toHaveLength(1);
				expect(c2).toHaveLength(1);
			}).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});

	it("late subscriber gets nothing (no replay)", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* ArtifactBus;
				yield* bus.emit({ kind: "add", artifact: null, id: "early" });
				const collected: unknown[] = [];
				yield* bus.subscribe((e) => collected.push(e));
				expect(collected).toHaveLength(0);
			}).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});

	it("unsubscribe stops further deliveries", async () => {
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* ArtifactBus;
				const collected: unknown[] = [];
				const off = yield* bus.subscribe((e) => collected.push(e));
				yield* bus.emit({ kind: "add", artifact: null, id: "1" });
				off();
				yield* bus.emit({ kind: "add", artifact: null, id: "2" });
				expect(collected).toHaveLength(1);
			}).pipe(Effect.provide(makeArtifactBusLive())),
		);
	});
});

describe("EventBus (Effect Layer)", () => {
	beforeEach(resetSingletons);

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
			Effect.gen(function* () {
				const bus = yield* EventBus;
				const collected: unknown[] = [];
				yield* bus.subscribe((e) => collected.push(e));
				yield* bus.emit({ ts: 123, project: "p", kind: "k" });
				expect(collected).toHaveLength(1);
			}).pipe(Effect.provide(makeEventBusLive())),
		);
	});
});

describe("ReloadBus (Effect Layer)", () => {
	beforeEach(resetSingletons);

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
			Effect.gen(function* () {
				const bus = yield* ReloadBus;
				const collected: string[] = [];
				yield* bus.subscribe((e) => collected.push(e));
				yield* bus.emit("reload-signal");
				expect(collected).toEqual(["reload-signal"]);
			}).pipe(Effect.provide(makeReloadBusLive())),
		);
	});
});
