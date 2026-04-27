import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../infra/config.ts";
import { makeProjectsServiceLive } from "../../infra/projects.ts";
import {
	makeTerminalSessionsLive,
	makeZellijSpawnLive,
	TerminalSessions,
	TerminalSessionsTest,
} from "../../infra/terminal-sessions.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const openSessionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		const svc = yield* TerminalSessions;
		const session = yield* svc.open(id);
		return c.json(session, 200);
	}).pipe(
		Effect.catchAll((err) =>
			Effect.succeed(c.json({ error: err instanceof Error ? err.message : "open failed" }, 500)),
		),
	);

const listSessionsHandler = (_c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const svc = yield* TerminalSessions;
		const sessions = yield* svc.list();
		return new Response(JSON.stringify({ sessions }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

const getSessionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		const svc = yield* TerminalSessions;
		const session = yield* svc.get(id);
		if (!session) return c.json({ error: "not found" }, 404);
		return c.json(session, 200);
	});

const deleteSessionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const idRaw = c.req.param("id");
		const id = idRaw ?? "";
		const svc = yield* TerminalSessions;
		yield* svc.close(id);
		return new Response(null, { status: 204 });
	}).pipe(Effect.catchAll(() => Effect.succeed(new Response(null, { status: 204 }))));

const makeDeps = () =>
	Layer.provide(
		makeTerminalSessionsLive(),
		Layer.merge(
			Layer.provide(makeProjectsServiceLive(), defaultConfigLayer),
			makeZellijSpawnLive(),
		),
	);

const app = new Hono<{ Bindings: AppBindings }>()
	.post("/api/projects/:id/terminal", defineRoute({ deps: makeDeps, handler: openSessionHandler }))
	.get("/api/sessions", defineRoute({ deps: makeDeps, handler: listSessionsHandler }))
	.get("/api/sessions/:id", defineRoute({ deps: makeDeps, handler: getSessionHandler }))
	.delete("/api/sessions/:id", defineRoute({ deps: makeDeps, handler: deleteSessionHandler }));

const testDeps = Layer.provide(TerminalSessionsTest, ConfigTest);

const testApp = new Hono<{ Bindings: AppBindings }>()
	.post("/api/projects/:id/terminal", defineRoute({ deps: testDeps, handler: openSessionHandler }))
	.get("/api/sessions", defineRoute({ deps: testDeps, handler: listSessionsHandler }))
	.get("/api/sessions/:id", defineRoute({ deps: testDeps, handler: getSessionHandler }))
	.delete("/api/sessions/:id", defineRoute({ deps: testDeps, handler: deleteSessionHandler }));

export const sessionsRoute = { app, testApp } satisfies RouteModule<typeof app>;
