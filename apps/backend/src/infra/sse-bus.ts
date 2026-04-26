import { Context, Effect, Layer } from "effect";
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

/**
 * Process-wide imperative pub/sub. The bus is a singleton because every
 * subscriber must see emissions from every publisher across the whole
 * runtime — Effect Layer scoping would create one PubSub per `Effect.provide`
 * tree, leaving the file-watcher and the SSE handler talking past each other.
 *
 * The Effect Layer (e.g. `makeArtifactBusLive`) wraps the singleton so route
 * handlers can still consume the bus via `Context.Tag`. Imperative consumers
 * (Hono `streamSSE` callbacks) call `subscribe(callback)` directly.
 */
class ImperativeBus<T> {
	private subs = new Set<(e: T) => void>();
	private history: T[] = [];
	constructor(private readonly historySize: number) {}

	emit(event: T): void {
		if (this.historySize > 0) {
			this.history.push(event);
			if (this.history.length > this.historySize) this.history.shift();
		}
		for (const cb of this.subs) {
			try {
				cb(event);
			} catch {
				// subscribers are best-effort; do not let one failure block others
			}
		}
	}

	subscribe(cb: (event: T) => void): () => void {
		this.subs.add(cb);
		return () => {
			this.subs.delete(cb);
		};
	}

	getHistory(): readonly T[] {
		return [...this.history];
	}
}

// ── Module-level singletons ─────────────────────────────────────────────────
export const artifactBusInstance = new ImperativeBus<ArtifactEvent>(0);
export const eventBusInstance = new ImperativeBus<PiEvent>(2000);
export const reloadBusInstance = new ImperativeBus<string>(0);

// ── Effect Layer wrappers ───────────────────────────────────────────────────

export interface ArtifactBusService {
	readonly emit: (event: ArtifactEvent) => Effect.Effect<void, never, never>;
	readonly history: () => Effect.Effect<readonly ArtifactEvent[], never, never>;
	readonly subscribe: (
		cb: (event: ArtifactEvent) => void,
	) => Effect.Effect<() => void, never, never>;
}

export const ArtifactBus = Context.GenericTag<ArtifactBusService>("ArtifactBus");

export const makeArtifactBusLive = (): Layer.Layer<ArtifactBusService> =>
	Layer.succeed(ArtifactBus, {
		emit: (event) => Effect.sync(() => artifactBusInstance.emit(event)),
		history: () => Effect.sync(() => artifactBusInstance.getHistory()),
		subscribe: (cb) => Effect.sync(() => artifactBusInstance.subscribe(cb)),
	});

export interface EventBusService {
	readonly emit: (event: PiEvent) => Effect.Effect<void, never, never>;
	readonly history: () => Effect.Effect<readonly PiEvent[], never, never>;
	readonly subscribe: (cb: (event: PiEvent) => void) => Effect.Effect<() => void, never, never>;
}

export const EventBus = Context.GenericTag<EventBusService>("EventBus");

export const makeEventBusLive = (): Layer.Layer<EventBusService> =>
	Layer.succeed(EventBus, {
		emit: (event) => Effect.sync(() => eventBusInstance.emit(event)),
		history: () => Effect.sync(() => eventBusInstance.getHistory()),
		subscribe: (cb) => Effect.sync(() => eventBusInstance.subscribe(cb)),
	});

export interface ReloadBusService {
	readonly emit: (event: string) => Effect.Effect<void, never, never>;
	readonly history: () => Effect.Effect<readonly string[], never, never>;
	readonly subscribe: (cb: (event: string) => void) => Effect.Effect<() => void, never, never>;
}

export const ReloadBus = Context.GenericTag<ReloadBusService>("ReloadBus");

export const makeReloadBusLive = (): Layer.Layer<ReloadBusService> =>
	Layer.succeed(ReloadBus, {
		emit: (event) => Effect.sync(() => reloadBusInstance.emit(event)),
		history: () => Effect.sync(() => reloadBusInstance.getHistory()),
		subscribe: (cb) => Effect.sync(() => reloadBusInstance.subscribe(cb)),
	});
