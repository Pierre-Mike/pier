import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { BlobServer, makeBlobServerLive, makeBlobServerTest } from "../../infra/blob-server.ts";
import { ConfigTest } from "../../infra/config.ts";
import { makeRepoServiceLive, makeRepoServiceTest, RepoService } from "../../infra/repo.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const projectBlobHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		const path = c.req.query("path");
		if (!path) return c.text("missing path", 400);
		const repo = yield* RepoService;
		const resolved = yield* repo.resolvePath({ projectId: id, path });
		const blob = yield* BlobServer;
		const response = yield* blob.serve(resolved);
		return response;
	}).pipe(Effect.catchAll(() => Effect.succeed(c.text("not found", 404))));

const makeDeps = (c: Context<{ Bindings: AppBindings }>) =>
	Layer.merge(Layer.provide(makeRepoServiceLive(), c.env.makeConfigLayer), makeBlobServerLive());

const app = new Hono<{ Bindings: AppBindings }>().get(
	"/api/projects/:id/blob",
	defineRoute({ deps: makeDeps, handler: projectBlobHandler }),
);

const testDeps = Layer.merge(
	Layer.provide(makeRepoServiceTest(new Map()), ConfigTest),
	makeBlobServerTest(new Map([["/test/foo/bar.txt", "test content"]])),
);

const testApp = new Hono<{ Bindings: AppBindings }>().get(
	"/api/projects/:id/blob",
	defineRoute({ deps: testDeps, handler: projectBlobHandler }),
);

export const projectsBlobRoute = { app, testApp } satisfies RouteModule<typeof app>;
