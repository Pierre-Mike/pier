import { Context, Effect, Layer, PubSub, type Scope, Stream } from "effect";
import type { ArtifactKind } from "../core/blob-classify.ts";
import type { PiEvent } from "../core/event-adapt.ts";

export type Artifact = {
	id: string;
	project: string;
	run?: string;
	name: string;
	ext: string;
	kind: ArtifactKind;
	size: number;
	mtime: number;
	path: string;
};

export type ArtifactEvent = {
	kind: "add" | "change" | "unlink";
	artifact: Artifact | null;
	id: string;
};

export interface SSEBus<T> {
	readonly emit: (event: T) => Effect.Effect<void, never, never>;
	readonly subscribe: () => Effect.Effect<Stream.Stream<T>, never, Scope.Scope>;
	readonly history: () => Effect.Effect<readonly T[], never, never>;
}

const makeSSEBus = <T>(historySize: number): Effect.Effect<SSEBus<T>> =>
	Effect.gen(function* () {
		const pubsub = yield* PubSub.unbounded<T>();
		const historyBuffer: T[] = [];

		return {
			emit: (event: T) =>
				Effect.gen(function* () {
					if (historySize > 0) {
						historyBuffer.push(event);
						if (historyBuffer.length > historySize) {
							historyBuffer.shift();
						}
					}
					yield* PubSub.publish(pubsub, event);
				}),
			subscribe: () =>
				Effect.gen(function* () {
					const queue = yield* PubSub.subscribe(pubsub);
					return Stream.fromQueue(queue);
				}),
			history: () => Effect.succeed([...historyBuffer]),
		};
	});

export interface ArtifactBusService {
	readonly emit: (event: ArtifactEvent) => Effect.Effect<void, never, never>;
	readonly subscribe: () => Effect.Effect<Stream.Stream<ArtifactEvent>, never, Scope.Scope>;
	readonly history: () => Effect.Effect<readonly ArtifactEvent[], never, never>;
}

export const ArtifactBus = Context.GenericTag<ArtifactBusService>("ArtifactBus");

export const makeArtifactBusLive = (): Layer.Layer<ArtifactBusService> =>
	Layer.effect(
		ArtifactBus,
		Effect.map(makeSSEBus<ArtifactEvent>(0), (bus) => ({
			emit: bus.emit,
			subscribe: bus.subscribe,
			history: bus.history,
		})),
	);

export interface EventBusService {
	readonly emit: (event: PiEvent) => Effect.Effect<void, never, never>;
	readonly subscribe: () => Effect.Effect<Stream.Stream<PiEvent>, never, Scope.Scope>;
	readonly history: () => Effect.Effect<readonly PiEvent[], never, never>;
}

export const EventBus = Context.GenericTag<EventBusService>("EventBus");

export const makeEventBusLive = (): Layer.Layer<EventBusService> =>
	Layer.effect(
		EventBus,
		Effect.map(makeSSEBus<PiEvent>(2000), (bus) => ({
			emit: bus.emit,
			subscribe: bus.subscribe,
			history: bus.history,
		})),
	);

export interface ReloadBusService {
	readonly emit: (event: string) => Effect.Effect<void, never, never>;
	readonly subscribe: () => Effect.Effect<Stream.Stream<string>, never, Scope.Scope>;
	readonly history: () => Effect.Effect<readonly string[], never, never>;
}

export const ReloadBus = Context.GenericTag<ReloadBusService>("ReloadBus");

export const makeReloadBusLive = (): Layer.Layer<ReloadBusService> =>
	Layer.effect(
		ReloadBus,
		Effect.map(makeSSEBus<string>(0), (bus) => ({
			emit: bus.emit,
			subscribe: bus.subscribe,
			history: bus.history,
		})),
	);
