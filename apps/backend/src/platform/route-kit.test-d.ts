/**
 * Compile-time type tests for route-kit.
 * Verified by `bun run typecheck` (tsc --noEmit).
 * No runtime assertions — TypeScript is the test runner here.
 */
import { Context, Effect, Layer } from "effect";
import type { Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";
import { ConfigService } from "./config.repo.ts";
import { type RoutePair, route, routeAdvanced, type ServicePair } from "./route-kit.ts";

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

interface FooSvc {
	readonly val: number;
}
const FooSvc = Context.GenericTag<FooSvc>("@test-d/FooSvc");

// ---------------------------------------------------------------------------
// ServicePair<R> type shape
// ---------------------------------------------------------------------------

export const _validServicePair: ServicePair<FooSvc> = {
	live: Layer.succeed(FooSvc, { val: 1 }),
	test: Layer.succeed(FooSvc, { val: 2 }),
};

// @ts-expect-error — missing test
export const _missingTest: ServicePair<FooSvc> = {
	live: Layer.succeed(FooSvc, { val: 1 }),
};

// @ts-expect-error — missing live
export const _missingLive: ServicePair<FooSvc> = {
	test: Layer.succeed(FooSvc, { val: 2 }),
};

// ---------------------------------------------------------------------------
// RoutePair<A> type shape
// ---------------------------------------------------------------------------

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
// route() overload 2: { handler } (config-only)
// ---------------------------------------------------------------------------

// Handler R = ConfigService when no deps
export const _routeConfigOnly = route({
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			yield* ConfigService;
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
			yield* ConfigService; // not provided when deps: "none"
			return new Response();
		}),
});

// ---------------------------------------------------------------------------
// routeAdvanced()
// ---------------------------------------------------------------------------

// Accepts explicit Layer<R> for both halves
export const _routeAdvancedStatic = routeAdvanced({
	liveDeps: Layer.succeed(FooSvc, { val: 1 }),
	testDeps: Layer.succeed(FooSvc, { val: 2 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			yield* FooSvc;
			return new Response();
		}),
});

// Accepts factory form () => Layer<R>
export const _routeAdvancedFactory = routeAdvanced({
	liveDeps: (_c: AnyContext) => Layer.succeed(FooSvc, { val: 99 }),
	testDeps: () => Layer.succeed(FooSvc, { val: 88 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			yield* FooSvc;
			return new Response();
		}),
});

// @ts-expect-error — missing testDeps
export const _routeAdvancedMissingTest = routeAdvanced({
	liveDeps: Layer.succeed(FooSvc, { val: 1 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			yield* FooSvc;
			return new Response();
		}),
});

// @ts-expect-error — missing liveDeps
export const _routeAdvancedMissingLive = routeAdvanced({
	testDeps: Layer.succeed(FooSvc, { val: 2 }),
	handler: (_c: AnyContext) =>
		Effect.gen(function* () {
			yield* FooSvc;
			return new Response();
		}),
});
