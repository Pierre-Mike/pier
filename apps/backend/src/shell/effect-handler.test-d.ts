/**
 * Compile-time type tests for defineRoute.
 * Verified by `bun run typecheck` (tsc --noEmit).
 * No runtime assertions — TypeScript is the test runner here.
 */
import { Effect } from "effect";
import { type ConfigService, ConfigTest } from "../infra/config.ts";
import { defineRoute } from "./effect-handler.ts";

// ---------------------------------------------------------------------------
// defineRoute POSITIVE CASES — must compile without error
// ---------------------------------------------------------------------------

// factory deps when R ≠ never
export const _defineRouteFactoryDeps = defineRoute<ConfigService>({
	deps: () => ConfigTest,
	handler: () => Effect.succeed(new Response()),
});

// static deps when R ≠ never
export const _defineRouteStaticDeps = defineRoute<ConfigService>({
	deps: ConfigTest,
	handler: () => Effect.succeed(new Response()),
});

// no deps when R = never
export const _defineRouteNoDeps = defineRoute({
	handler: () => Effect.succeed(new Response()),
});

// ---------------------------------------------------------------------------
// defineRoute NEGATIVE CASES — must be TypeScript errors
// ---------------------------------------------------------------------------

// deps omitted when R ≠ never — overload 2 requires deps, overload 1 rejects R≠never via `R extends never`
// @ts-expect-error — deps is required when R is not never
export const _defineRouteMissingDeps = defineRoute<ConfigService>({
	handler: () => Effect.succeed(new Response()),
});

// deps provided when R = never — both overloads reject it (deps: never on each)
export const _defineRouteForbiddenDeps = defineRoute<never>({
	// @ts-expect-error — deps is forbidden when R = never
	deps: ConfigTest,
	handler: () => Effect.succeed(new Response()),
});
