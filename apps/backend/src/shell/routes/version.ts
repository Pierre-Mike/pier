import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { getVersion } from "../../core/version.ts";
import { ConfigService, ConfigTest, makeConfigLayer } from "../../infra/config.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const versionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const raw = yield* config.get();
		const version = yield* getVersion(raw);
		return c.json(version, 200);
	});

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/version",
	defineRoute({
		deps: (c) => makeConfigLayer(c.env),
		handler: versionHandler,
	}),
);

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/version",
	defineRoute({
		deps: ConfigTest,
		handler: versionHandler,
	}),
);

export const versionRoute = { app, testApp } satisfies RouteModule<typeof app>;
