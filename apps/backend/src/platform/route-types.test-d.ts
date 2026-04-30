/**
 * Compile-time type tests for RouteModule.
 * Verified by `bun run typecheck` (tsc --noEmit).
 * No runtime assertions — TypeScript is the test runner here.
 */
import { Hono } from "hono";
import type { AppBindings } from "./effect-handler.ts";
import type { RouteModule } from "./route-types.ts";

type TestApp = Hono<{ Bindings: AppBindings }>;

// ---------------------------------------------------------------------------
// POSITIVE CASES — must compile without error
// ---------------------------------------------------------------------------

// RouteModule<TApp> must accept an object with both app and testApp as TApp
export const _validModule: RouteModule<TestApp> = {
	app: new Hono<{ Bindings: AppBindings }>(),
	testApp: new Hono<{ Bindings: AppBindings }>(),
};

// ---------------------------------------------------------------------------
// NEGATIVE CASES — must be TypeScript errors
// ---------------------------------------------------------------------------

// @ts-expect-error — missing testApp
export const _missingTestApp: RouteModule<TestApp> = {
	app: new Hono<{ Bindings: AppBindings }>(),
};

// @ts-expect-error — missing app
export const _missingApp: RouteModule<TestApp> = {
	testApp: new Hono<{ Bindings: AppBindings }>(),
};
