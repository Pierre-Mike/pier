import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, route } from "../../platform/route-kit.ts";

const healthHandler = (_c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const timestamp = yield* Effect.sync(() => Date.now());
		return new Response(JSON.stringify({ status: "ok" as const, timestamp }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

const r = route({
	deps: "none",
	handler: healthHandler,
});

const app = new Hono<{ Bindings: AppBindings }>().get("/health", r.live);

const testApp = new Hono<{ Bindings: AppBindings }>().get("/health", r.test);

export const healthRoute = { app, testApp } satisfies RouteModule<typeof app>;
