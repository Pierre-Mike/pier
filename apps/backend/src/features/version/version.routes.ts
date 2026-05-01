import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigService, ConfigTest, makeConfigLayer } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, routeAdvanced } from "../../platform/route-kit.ts";
import { getVersion } from "./version.core.ts";

const versionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const raw = yield* config.get();
		const version = yield* getVersion(raw);
		return c.json(version, 200);
	});

const r = routeAdvanced({
	liveDeps: (c) => makeConfigLayer(c.env),
	testDeps: ConfigTest,
	handler: versionHandler,
});

const app = new Hono<{ Bindings: AppBindings }>().get("/version", r.live);

const testApp = new Hono<{ Bindings: AppBindings }>().get("/version", r.test);

export const versionRoute = { app, testApp } satisfies RouteModule<typeof app>;
