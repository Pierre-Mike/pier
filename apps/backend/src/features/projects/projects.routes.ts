import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { mountPair, type RouteModule, routeAdvanced } from "../../platform/route-kit.ts";
import { makeRepoServiceLive, makeRepoServiceTest, RepoService } from "./projects.files.repo.ts";
import {
	GithubUrlService,
	makeGithubUrlServiceLive,
	makeGithubUrlServiceTest,
} from "./projects.github.repo.ts";
import {
	makeProjectsServiceLive,
	makeProjectsServiceTest,
	ProjectsService,
} from "./projects.repo.ts";

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

const rList = routeAdvanced({
	liveDeps: Layer.provide(makeProjectsServiceLive(), defaultConfigLayer),
	testDeps: Layer.provide(
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
	),
	handler: projectsListHandler,
});

const projectGithubUrlHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const id = c.req.param("id") ?? "";
		const svc = yield* GithubUrlService;
		const url = yield* svc.resolve(id);
		if (!url) {
			return new Response(JSON.stringify({ url: null }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ url }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

const rGithubUrl = routeAdvanced({
	liveDeps: Layer.provide(makeGithubUrlServiceLive(), defaultConfigLayer),
	testDeps: Layer.provide(
		makeGithubUrlServiceTest(
			new Map<string, string | null>([
				["test-proj", "https://github.com/owner/repo"],
				["non-gh-proj", null],
			]),
		),
		ConfigTest,
	),
	handler: projectGithubUrlHandler,
});

const rFiles = routeAdvanced({
	liveDeps: Layer.provide(makeRepoServiceLive(), defaultConfigLayer),
	testDeps: Layer.provide(
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
	),
	handler: projectFilesHandler,
});

const { app, testApp } = mountPair((a, h) =>
	a
		.get("/api/projects", rList[h])
		.get("/api/projects/:id/files", rFiles[h])
		.get("/api/projects/:id/github-url", rGithubUrl[h]),
);

export const projectsRoute = { app, testApp } satisfies RouteModule<typeof app>;
