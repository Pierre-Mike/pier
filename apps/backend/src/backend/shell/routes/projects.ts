import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../infra/config.ts";
import {
	makeProjectsServiceLive,
	makeProjectsServiceTest,
	ProjectsService,
} from "../../infra/projects.ts";
import { makeRepoServiceLive, makeRepoServiceTest, RepoService } from "../../infra/repo.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const projectsListHandler = (_c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const svc = yield* ProjectsService;
		const projects = yield* svc.list();
		return new Response(JSON.stringify({ projects }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

const projectFilesHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		const repo = yield* RepoService;
		const result = yield* repo.listFiles(id);
		if (result instanceof Error) {
			return c.json({ files: [] }, 400);
		}
		return c.json({ files: result }, 200);
	}).pipe(
		Effect.catchAll(() =>
			Effect.succeed(
				new Response(JSON.stringify({ files: [] }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				}),
			),
		),
	);

const app = new Hono<{ Bindings: AppBindings }>()
	.get(
		"/api/projects",
		defineRoute({
			deps: () => Layer.provide(makeProjectsServiceLive(), defaultConfigLayer),
			handler: projectsListHandler,
		}),
	)
	.get(
		"/api/projects/:id/files",
		defineRoute({
			deps: () => Layer.provide(makeRepoServiceLive(), defaultConfigLayer),
			handler: projectFilesHandler,
		}),
	);

const testDeps = Layer.provide(
	Layer.merge(
		makeProjectsServiceTest([
			{
				id: "test-proj",
				name: "test-proj",
				path: "/tmp/test-projects/test-proj",
				isGitRepo: true,
				lastModified: Date.now(),
			},
		]),
		makeRepoServiceTest(new Map([["test-proj", [{ path: "README.md", size: 100 }]]])),
	),
	ConfigTest,
);

const testApp = new Hono<{ Bindings: AppBindings }>()
	.get(
		"/api/projects",
		defineRoute({
			deps: testDeps,
			handler: projectsListHandler,
		}),
	)
	.get(
		"/api/projects/:id/files",
		defineRoute({
			deps: testDeps,
			handler: projectFilesHandler,
		}),
	);

export const projectsRoute = { app, testApp } satisfies RouteModule<typeof app>;
