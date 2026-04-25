import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigTest } from "../../infra/config.ts";
import { makeRepoServiceLive, makeRepoServiceTest, RepoService } from "../../infra/repo.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const dropHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		let bodyRaw: Record<string, unknown>;
		try {
			bodyRaw = (yield* Effect.promise(() => c.req.parseBody({ all: true }))) as Record<
				string,
				unknown
			>;
		} catch {
			return c.json({ error: "bad form body" }, 400);
		}
		const raw = bodyRaw["files"] ?? bodyRaw["file"] ?? [];
		const files = (Array.isArray(raw) ? raw : [raw]).filter((x): x is File => x instanceof File);
		if (files.length === 0) return c.json({ error: "no files" }, 400);
		const repo = yield* RepoService;
		const result = yield* repo.saveDropped({ projectId: id, files });
		return c.json({ files: result }, 200);
	}).pipe(
		Effect.catchAll((err) =>
			Effect.succeed(
				c.json(
					{
						error:
							typeof err === "object" &&
							err !== null &&
							"message" in err &&
							typeof err.message === "string"
								? err.message
								: "save failed",
					},
					400,
				),
			),
		),
	);

const makeDeps = (c: Context<{ Bindings: AppBindings }>) =>
	Layer.provide(makeRepoServiceLive(), c.env.makeConfigLayer);

const app = new Hono<{ Bindings: AppBindings }>().post(
	"/api/projects/:id/drop",
	defineRoute({ deps: makeDeps, handler: dropHandler }),
);

const testDeps = Layer.provide(makeRepoServiceTest(new Map()), ConfigTest);

const testApp = new Hono<{ Bindings: AppBindings }>().post(
	"/api/projects/:id/drop",
	defineRoute({ deps: testDeps, handler: dropHandler }),
);

export const projectsDropRoute = { app, testApp } satisfies RouteModule<typeof app>;
