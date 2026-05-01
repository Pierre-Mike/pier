import { Effect } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigService } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, route } from "../../platform/route-kit.ts";

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

const r = route({
	handler: configHandler,
});

const app = new Hono<{ Bindings: AppBindings }>().get("/api/config", r.live);

const testApp = new Hono<{ Bindings: AppBindings }>().get("/api/config", r.test);

export const configRoute = { app, testApp } satisfies RouteModule<typeof app>;
