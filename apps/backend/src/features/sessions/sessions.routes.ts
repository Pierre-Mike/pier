import { Effect } from "effect";
import type { Context } from "hono";
import { type AppBindings, mountPair, route } from "../../platform/route-kit.ts";
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

const deps = { live: makeTerminalSessionsLive(), test: TerminalSessionsTest };

const r = {
	open: route({ deps, handler: openSessionHandler }),
	def: route({ deps, handler: openDefaultSessionHandler }),
	list: route({ deps, handler: listSessionsHandler }),
	get: route({ deps, handler: getSessionHandler }),
	del: route({ deps, handler: deleteSessionHandler }),
};

const { app, testApp } = mountPair((a, h) =>
	a
		.post("/api/projects/:id/terminal", r.open[h])
		.post("/api/sessions/default", r.def[h])
		.get("/api/sessions", r.list[h])
		.get("/api/sessions/:id", r.get[h])
		.delete("/api/sessions/:id", r.del[h]),
);

export const sessionsRoute = { app, testApp } satisfies RouteModule<typeof app>;
