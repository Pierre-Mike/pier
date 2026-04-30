import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import { type AppBindings, defineRoute } from "../../platform/effect-handler.ts";
import type { RouteModule } from "../../platform/route-types.ts";
import {
	makeTerminalSessionsLive,
	TerminalSessions,
	TerminalSessionsTest,
} from "./sessions.repo.ts";

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

const openDefaultSessionHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const svc = yield* TerminalSessions;
		const session = yield* svc.openDefault();
		return c.json(session, 200);
	}).pipe(
		Effect.catchAll((err) =>
			Effect.succeed(c.json({ error: err instanceof Error ? err.message : "open failed" }, 500)),
		),
	);

const makeDeps = () => Layer.provide(makeTerminalSessionsLive(), defaultConfigLayer);

const app = new Hono<{ Bindings: AppBindings }>()
	.post("/api/projects/:id/terminal", defineRoute({ deps: makeDeps, handler: openSessionHandler }))
	.post(
		"/api/sessions/default",
		defineRoute({ deps: makeDeps, handler: openDefaultSessionHandler }),
	)
	.get("/api/sessions", defineRoute({ deps: makeDeps, handler: listSessionsHandler }))
	.get("/api/sessions/:id", defineRoute({ deps: makeDeps, handler: getSessionHandler }))
	.delete("/api/sessions/:id", defineRoute({ deps: makeDeps, handler: deleteSessionHandler }));

const testDeps = Layer.provide(TerminalSessionsTest, ConfigTest);

const testApp = new Hono<{ Bindings: AppBindings }>()
	.post("/api/projects/:id/terminal", defineRoute({ deps: testDeps, handler: openSessionHandler }))
	.post(
		"/api/sessions/default",
		defineRoute({ deps: testDeps, handler: openDefaultSessionHandler }),
	)
	.get("/api/sessions", defineRoute({ deps: testDeps, handler: listSessionsHandler }))
	.get("/api/sessions/:id", defineRoute({ deps: testDeps, handler: getSessionHandler }))
	.delete("/api/sessions/:id", defineRoute({ deps: testDeps, handler: deleteSessionHandler }));

export const sessionsRoute = { app, testApp } satisfies RouteModule<typeof app>;
