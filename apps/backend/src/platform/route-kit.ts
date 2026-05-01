import { Effect, Layer } from "effect";
import type { Context as HonoContext } from "hono";
import { Hono } from "hono";
import type { AppBindings } from "./bindings.ts";
import { type ConfigService, ConfigTest, defaultConfigLayer } from "./config.repo.ts";
import { runHandler } from "./effect-handler.ts";

export type { AppBindings };

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

/**
 * `{live, test}` of the same R. `route()` provides `defaultConfigLayer` to live and
 * `ConfigTest` to test, so the `live` field declares its residual `ConfigService`
 * requirement and feature files no longer call `Layer.provide(_, defaultConfigLayer)`.
 * A Layer with `RIn = never` is still assignable here (RIn is contravariant).
 */
export type ServicePair<R> = {
	readonly live: Layer.Layer<R, never, ConfigService>;
	readonly test: Layer.Layer<R>;
};

/** One call returns BOTH halves. Caller mounts `.live` on app, `.test` on testApp. */
export type RoutePair<A> = {
	readonly live: (c: AnyContext) => Promise<A>;
	readonly test: (c: AnyContext) => Promise<A>;
};

// `Effect.provide(layer)` collapses the `R` channel to `never`, but in the
// implementation signature `R = unknown`, so TS cannot narrow. Cast at the
// runHandler boundary; the runtime is sound by the public overloads above.
type _ProvidedEffect = Effect.Effect<unknown, unknown, never>;

// ── route() — public overloads ─────────────────────────────────────────────

/** Overload 1: feature service Layer + ConfigService auto-bundled. */
export function route<R, A = Response, E = never>(config: {
	deps: ServicePair<R>;
	handler: (c: AnyContext) => Effect.Effect<A, E, R | ConfigService>;
	onError?: (e: E, c: AnyContext) => Response;
}): RoutePair<A>;

/** Overload 2: config-only (no `deps`). Handler R = ConfigService. */
export function route<A = Response, E = never>(config: {
	handler: (c: AnyContext) => Effect.Effect<A, E, ConfigService>;
	onError?: (e: E, c: AnyContext) => Response;
}): RoutePair<A>;

/** Overload 3: literal sentinel `deps: "none"` forces handler R = never. */
export function route<A = Response, E = never>(config: {
	deps: "none";
	handler: (c: AnyContext) => Effect.Effect<A, E, never>;
	onError?: (e: E, c: AnyContext) => Response;
}): RoutePair<A>;

export function route(config: {
	deps?: ServicePair<unknown> | "none";
	handler: (c: AnyContext) => Effect.Effect<unknown, unknown, unknown>;
	onError?: (e: unknown, c: AnyContext) => Response;
}): RoutePair<unknown> {
	const { handler: fn, onError } = config;

	if (config.deps === "none") {
		const handler = async (c: AnyContext) =>
			runHandler({ effect: fn(c) as _ProvidedEffect, context: c, onError });
		return { live: handler, test: handler };
	}

	if (config.deps === undefined) {
		const liveHandler = async (c: AnyContext) =>
			runHandler({
				effect: fn(c).pipe(Effect.provide(defaultConfigLayer)) as _ProvidedEffect,
				context: c,
				onError,
			});
		const testHandler = async (c: AnyContext) =>
			runHandler({
				effect: fn(c).pipe(Effect.provide(ConfigTest)) as _ProvidedEffect,
				context: c,
				onError,
			});
		return { live: liveHandler, test: testHandler };
	}

	const deps = config.deps;
	// Live: provide defaultConfigLayer (parent → child), then re-merge so the
	// handler's `R | ConfigService` channel resolves both deps.live's R and
	// ConfigService.
	const liveLayer = Layer.merge(Layer.provide(deps.live, defaultConfigLayer), defaultConfigLayer);
	const liveHandler = async (c: AnyContext) =>
		runHandler({
			effect: fn(c).pipe(Effect.provide(liveLayer)) as _ProvidedEffect,
			context: c,
			onError,
		});
	// Test: deps.test is self-contained; merge ConfigTest so handler R resolves.
	const testLayer = Layer.merge(deps.test, ConfigTest);
	const testHandler = async (c: AnyContext) =>
		runHandler({
			effect: fn(c).pipe(Effect.provide(testLayer)) as _ProvidedEffect,
			context: c,
			onError,
		});
	return { live: liveHandler, test: testHandler };
}

// ── routeAdvanced() — explicit Layer<R> for both halves ────────────────────

/** Rare: arbitrary `Layer<R>` for both prod and test. */
export const routeAdvanced = <R, E = never, A = Response>(config: {
	liveDeps: Layer.Layer<R> | ((c: AnyContext) => Layer.Layer<R>);
	testDeps: Layer.Layer<R> | ((c: AnyContext) => Layer.Layer<R>);
	handler: (c: AnyContext) => Effect.Effect<A, E, R>;
	onError?: (e: E, c: AnyContext) => Response;
}): RoutePair<A> => {
	const { liveDeps, testDeps, handler: fn, onError } = config;

	const liveHandler = async (c: AnyContext) => {
		const layer = typeof liveDeps === "function" ? liveDeps(c) : liveDeps;
		return runHandler({ effect: fn(c).pipe(Effect.provide(layer)), context: c, onError });
	};

	const testHandler = async (c: AnyContext) => {
		const layer = typeof testDeps === "function" ? testDeps(c) : testDeps;
		return runHandler({ effect: fn(c).pipe(Effect.provide(layer)), context: c, onError });
	};

	return { live: liveHandler, test: testHandler };
};

// ── mountPair() — twin Hono builder ────────────────────────────────────────

/** Wiring helper — caller writes the route chain once; both apps emerge. */
export const mountPair = <T extends Hono<{ Bindings: AppBindings }>>(
	build: (app: Hono<{ Bindings: AppBindings }>, half: "live" | "test") => T,
): { app: T; testApp: T } => {
	const app = build(new Hono<{ Bindings: AppBindings }>(), "live");
	const testApp = build(new Hono<{ Bindings: AppBindings }>(), "test");
	return { app, testApp };
};

export type { RouteModule } from "./route-types.ts";
