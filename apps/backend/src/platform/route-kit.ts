import { Effect, Layer } from "effect";
import type { Hono, Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";
import { type ConfigService, ConfigTest, defaultConfigLayer } from "./config.repo.ts";
import { runHandler } from "./effect-handler.ts";

export type { AppBindings };

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

/** {live, test} of the same R. defaultConfigLayer is auto-provided to live (parent). */
export type ServicePair<R> = {
	readonly live: Layer.Layer<R>;
	readonly test: Layer.Layer<R>;
};

/** One call returns BOTH halves. Caller mounts .live on app, .test on testApp. */
export type RoutePair<A> = {
	readonly live: (c: AnyContext) => Promise<A>;
	readonly test: (c: AnyContext) => Promise<A>;
};

export interface RouteFactory {
	// Overload 1: feature service Layer + ConfigService auto-bundled
	<R, A = Response, E = never>(config: {
		deps: ServicePair<R>;
		handler: (c: AnyContext) => Effect.Effect<A, E, R | ConfigService>;
		onError?: (e: E, c: AnyContext) => Response;
	}): RoutePair<A>;

	// Overload 2: Config-only (no deps)
	<A = Response, E = never>(config: {
		handler: (c: AnyContext) => Effect.Effect<A, E, ConfigService>;
		onError?: (e: E, c: AnyContext) => Response;
	}): RoutePair<A>;

	// Overload 3: No deps (literal sentinel forces R = never)
	<A = Response, E = never>(config: {
		deps: "none";
		handler: (c: AnyContext) => Effect.Effect<A, E, never>;
		onError?: (e: E, c: AnyContext) => Response;
	}): RoutePair<A>;
}

export const route: RouteFactory = (config: {
	deps?: ServicePair<never> | "none";
	handler: (c: AnyContext) => Effect.Effect<unknown, never, never>;
	onError?: (e: never, c: AnyContext) => Response;
}): RoutePair<unknown> => {
	if (config.deps === "none") {
		// Overload 3: no Layer composition
		const fn = config.handler;
		const onError = config.onError;
		const handler = async (c: AnyContext) => runHandler({ effect: fn(c), context: c, onError });
		return { live: handler, test: handler };
	}

	if (config.deps === undefined) {
		// Overload 2: config-only
		const fn = config.handler;
		const onError = config.onError;
		const liveHandler = async (c: AnyContext) =>
			runHandler({ effect: fn(c).pipe(Effect.provide(defaultConfigLayer)), context: c, onError });
		const testHandler = async (c: AnyContext) =>
			runHandler({ effect: fn(c).pipe(Effect.provide(ConfigTest)), context: c, onError });
		return { live: liveHandler, test: testHandler };
	}

	// Overload 1: ServicePair<R>
	const deps = config.deps as ServicePair<never>;
	const fn = config.handler;
	const onError = config.onError;

	// Live: provide defaultConfigLayer to deps.live, then merge with defaultConfigLayer
	// so the handler can access both R and ConfigService
	const liveLayerBase = Layer.provide(deps.live, defaultConfigLayer);
	const liveLayer = Layer.merge(liveLayerBase, defaultConfigLayer);
	const liveHandler = async (c: AnyContext) =>
		runHandler({ effect: fn(c).pipe(Effect.provide(liveLayer)), context: c, onError });

	// Test: merge deps.test with ConfigTest so handler can access both R and ConfigService
	const testLayer = Layer.merge(deps.test, ConfigTest);
	const testHandler = async (c: AnyContext) =>
		runHandler({ effect: fn(c).pipe(Effect.provide(testLayer)), context: c, onError });

	return { live: liveHandler, test: testHandler };
};

/** Rare: arbitrary Layer<R> for both prod and test. Allowlisted. */
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

/** Wiring helper — caller writes the route chain once; both apps emerge. */
export const mountPair = <T extends Hono<{ Bindings: AppBindings }>>(
	build: (app: Hono<{ Bindings: AppBindings }>, half: "live" | "test") => T,
): { app: T; testApp: T } => {
	const { Hono: HonoCtor } = require("hono");
	const app = build(new HonoCtor<{ Bindings: AppBindings }>(), "live");
	const testApp = build(new HonoCtor<{ Bindings: AppBindings }>(), "test");
	return { app, testApp };
};

/** Re-export RouteModule for convenience */
export type { RouteModule } from "./route-types.ts";
