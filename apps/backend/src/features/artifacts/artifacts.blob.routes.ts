import { join } from "node:path";
import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigService, ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import { type AppBindings, defineRoute } from "../../platform/effect-handler.ts";
import type { RouteModule } from "../../platform/route-types.ts";
import {
	BlobServer,
	makeBlobServerLive,
	makeBlobServerTest,
} from "./artifacts.blob-server.repo.ts";

const artifactBlobHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const id = c.req.query("id");
		if (!id || id.includes("..") || id.startsWith("/")) {
			return c.text("bad id", 400);
		}
		const cfg = yield* ConfigService;
		const config = yield* cfg.get();
		const absPath = join(config.artifactsDir, id);
		const blob = yield* BlobServer;
		const response = yield* blob.serve(absPath);
		return response;
	}).pipe(Effect.catchAll(() => Effect.succeed(c.text("not found", 404))));

const makeDeps = () => Layer.merge(defaultConfigLayer, makeBlobServerLive());

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/api/artifacts/blob",
	defineRoute({ deps: makeDeps, handler: artifactBlobHandler }),
);

const testDeps = Layer.merge(
	ConfigTest,
	makeBlobServerTest(new Map([["/tmp/test-pi/artifacts/test.html", "<p>test</p>"]])),
);

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/api/artifacts/blob",
	defineRoute({ deps: testDeps, handler: artifactBlobHandler }),
);

export const artifactsBlobRoute = { app, testApp } satisfies RouteModule<typeof app>;
