import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import {
	ArtifactWatcher,
	ArtifactWatcherTest,
	makeArtifactWatcherLive,
} from "../../infra/artifact-watcher.ts";
import { makeArtifactBusLive } from "../../infra/sse-bus.ts";
import { ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import { type AppBindings, defineRoute } from "../../platform/effect-handler.ts";
import type { RouteModule } from "../../platform/route-types.ts";

type ListOptions = { project?: string; limit?: number };

const artifactsListHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const project = c.req.query("project");
		const limitRaw = c.req.query("limit");
		const limit = limitRaw ? Number(limitRaw) : 200;
		const watcher = yield* ArtifactWatcher;
		const opts: ListOptions = { limit };
		if (project !== undefined) opts.project = project;
		const artifacts = yield* watcher.list(opts);
		return c.json({ artifacts }, 200);
	});

const makeDeps = () => {
	const cfg = defaultConfigLayer;
	const bus = makeArtifactBusLive();
	const watcher = Layer.provide(makeArtifactWatcherLive(), Layer.merge(bus, cfg));
	return Layer.merge(bus, watcher);
};

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/api/artifacts",
	defineRoute({
		deps: makeDeps,
		handler: artifactsListHandler,
	}),
);

const testDeps = (() => {
	const bus = makeArtifactBusLive();
	const watcher = Layer.provide(ArtifactWatcherTest, Layer.merge(bus, ConfigTest));
	return Layer.merge(bus, watcher);
})();

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/api/artifacts",
	defineRoute({
		deps: testDeps,
		handler: artifactsListHandler,
	}),
);

export const artifactsRoute = { app, testApp } satisfies RouteModule<typeof app>;
