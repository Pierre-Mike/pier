import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigService, ConfigTest, defaultConfigLayer } from "../../infra/config.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const configHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const svc = yield* ConfigService;
		const cfg = yield* svc.get();
		return c.json(
			{
				appPort: cfg.appPort,
				sandboxPort: cfg.sandboxPort,
				zellijWebUrl: cfg.zellijWebUrl,
				projectsRoot: cfg.projectsRoot,
				artifactsDir: cfg.artifactsDir,
				claudeProjectsRoot: cfg.claudeProjectsRoot,
			},
			200,
		);
	});

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/api/config",
	defineRoute({
		deps: () => defaultConfigLayer,
		handler: configHandler,
	}),
);

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/api/config",
	defineRoute({
		deps: ConfigTest,
		handler: configHandler,
	}),
);

export const configRoute = { app, testApp } satisfies RouteModule<typeof app>;
