/**
 * Compile-time type tests for route-kit.
 * Verified by `bun run typecheck` (tsc --noEmit).
 * No runtime assertions — TypeScript is the test runner here.
 */
import { Effect, Layer } from "effect";
import type { Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";
import { ConfigService } from "./config.repo.ts";
import { type RoutePair, route, routeAdvanced, type ServicePair } from "./route-kit.ts";

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

// Define a test service Tag
class FooService extends Effect.Service<FooService>()("FooService", {
	succeed: { val: 0 },
}) {}

// ---------------------------------------------------------------------------
// ServicePair<R> type shape
// ---------------------------------------------------------------------------

// ServicePair<R> requires { live: Layer<R, never, ConfigService>; test: Layer<R> }
export const _validServicePair: ServicePair<FooService> = {
	live: Layer.succeed(FooService, { val: 1 }) as Layer.Layer<FooService, never, ConfigService>,
	test: Layer.succeed(FooService, { val: 2 }),
};

// @ts-expect-error — missing test
export const _missingTest: ServicePair<FooService> = {
	live: Layer.succeed(FooService, { val: 1 }) as Layer.Layer<FooService, never, ConfigService>,
};

// @ts-expect-error — missing live
export const _missingLive: ServicePair<FooService> = {
	test: Layer.succeed(FooService, { val: 2 }),
};

// ---------------------------------------------------------------------------
// RoutePair<A> type shape
// ---------------------------------------------------------------------------

// RoutePair<A> requires { live: (c) => Promise<A>; test: (c) => Promise<A> }
export const _validRoutePair: RoutePair<Response> = {
	live: async (_c: AnyContext) => new Response(),
	test: async (_c: AnyContext) => new Response(),
};

// @ts-expect-error — missing test
export const _missingTestHandler: RoutePair<Response> = {
	live: async (_c: AnyContext) => new Response(),
};

// @ts-expect-error — missing live
export const _missingLiveHandler: RoutePair<Response> = {
	test: async (_c: AnyContext) => new Response(),
};

// ---------------------------------------------------------------------------
// route() overload 1: { deps: ServicePair<R>, handler }
// ---------------------------------------------------------------------------

// Handler R = R | ConfigService when deps is ServicePair<R>
export const _routeWithDeps = route({
	deps: {
		live: Layer.succeed(FooService, { val: 1 }) as Layer.Layer<FooService, never, ConfigService>,
		test: Layer.succeed(FooService, { val: 2 }),
	},
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService;
			const _cfg = yield* ConfigService;
			return new Response();
		}),
});

// @ts-expect-error — handler R does not include the service declared in deps
export const _routeMismatchedR = route({
	deps: {
		live: Layer.succeed(FooService, { val: 1 }) as Layer.Layer<FooService, never, ConfigService>,
		test: Layer.succeed(FooService, { val: 2 }),
	},
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			// FooService not accessed — R mismatch
			const _cfg = yield* ConfigService;
			return new Response();
		}),
});

// ---------------------------------------------------------------------------
// route() overload 2: { handler } (config-only)
// ---------------------------------------------------------------------------

// Handler R = ConfigService when no deps
export const _routeConfigOnly = route({
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _cfg = yield* ConfigService;
			return new Response();
		}),
});

// @ts-expect-error — handler R cannot require additional services when deps is omitted
export const _routeConfigOnlyExtraService = route({
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService; // FooService not provided
			return new Response();
		}),
});

// ---------------------------------------------------------------------------
// route() overload 3: { deps: "none", handler }
// ---------------------------------------------------------------------------

// Handler R = never when deps is "none"
export const _routeNoDeps = route({
	deps: "none",
	handler: (_c: AnyContext) => Effect.succeed(new Response()),
});

// @ts-expect-error — handler R cannot require services when deps is "none"
export const _routeNoDepsButRequiresService = route({
	deps: "none",
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _cfg = yield* ConfigService; // not provided when deps: "none"
			return new Response();
		}),
});

// ---------------------------------------------------------------------------
// routeAdvanced()
// ---------------------------------------------------------------------------

// Accepts explicit Layer<R> for both halves
export const _routeAdvancedStatic = routeAdvanced({
	liveDeps: Layer.succeed(FooService, { val: 1 }),
	testDeps: Layer.succeed(FooService, { val: 2 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService;
			return new Response();
		}),
});

// Accepts factory form () => Layer<R>
export const _routeAdvancedFactory = routeAdvanced({
	liveDeps: (_c: AnyContext) => Layer.succeed(FooService, { val: 99 }),
	testDeps: () => Layer.succeed(FooService, { val: 88 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService;
			return new Response();
		}),
});

// @ts-expect-error — missing testDeps
export const _routeAdvancedMissingTest = routeAdvanced({
	liveDeps: Layer.succeed(FooService, { val: 1 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService;
			return new Response();
		}),
});

// @ts-expect-error — missing liveDeps
export const _routeAdvancedMissingLive = routeAdvanced({
	testDeps: Layer.succeed(FooService, { val: 2 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			const _foo = yield* FooService;
			return new Response();
		}),
});
