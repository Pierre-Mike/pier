import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const healthHandler = (_c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const timestamp = yield* Effect.sync(() => Date.now());
		return new Response(JSON.stringify({ status: "ok" as const, timestamp }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/health",
	defineRoute({
		handler: healthHandler,
	}),
);

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/health",
	defineRoute({
		handler: healthHandler,
	}),
);

export const healthRoute = { app, testApp } satisfies RouteModule<typeof app>;
