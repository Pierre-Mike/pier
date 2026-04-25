import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import {
	ClaudeEventStream,
	ClaudeEventStreamTest,
	makeClaudeEventStreamLive,
} from "../../infra/claude-events.ts";
import { ConfigTest, defaultConfigLayer } from "../../infra/config.ts";
import { EventBus, makeEventBusLive } from "../../infra/sse-bus.ts";
import { type AppBindings, defineRoute } from "../effect-handler.ts";
import type { RouteModule } from "./_types.ts";

const EVENT_HISTORY_MAX = 2000;

const eventsHistoryHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const limitRaw = c.req.query("limit");
		const limit = limitRaw ? Math.min(Number(limitRaw), EVENT_HISTORY_MAX) : EVENT_HISTORY_MAX;
		const project = c.req.query("project");
		const bus = yield* EventBus;
		const hist = yield* bus.history();
		let events = [...hist];
		if (project) events = events.filter((e) => e.project === project);
		return c.json({ events: events.slice(-limit) }, 200);
	});

type ReadHistoryOptions = { project?: string; session?: string; limit: number };

const logsHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const project = c.req.query("project");
		const session = c.req.query("session");
		const limitRaw = c.req.query("limit");
		const limitParsed = limitRaw ? Number(limitRaw) : 5000;
		const limit = Number.isFinite(limitParsed) ? limitParsed : 5000;
		const stream = yield* ClaudeEventStream;
		const opts: ReadHistoryOptions = { limit };
		if (project !== undefined) opts.project = project;
		if (session !== undefined) opts.session = session;
		const events = yield* stream.readHistory(opts);
		return c.json({ events }, 200);
	}).pipe(Effect.catchAll(() => Effect.succeed(c.json({ error: "read failed" }, 500))));

const makeDeps = () => {
	const cfg = defaultConfigLayer;
	const bus = makeEventBusLive();
	const stream = Layer.provide(makeClaudeEventStreamLive(), Layer.merge(bus, cfg));
	return Layer.merge(bus, stream);
};

const app = new Hono<{ Bindings: AppBindings }>()
	.get("/api/events/history", defineRoute({ deps: makeDeps, handler: eventsHistoryHandler }))
	.get("/api/logs", defineRoute({ deps: makeDeps, handler: logsHandler }));

const testDeps = (() => {
	const bus = makeEventBusLive();
	const stream = Layer.provide(ClaudeEventStreamTest, Layer.merge(bus, ConfigTest));
	return Layer.merge(bus, stream);
})();

const testApp = new Hono<{ Bindings: AppBindings }>()
	.get("/api/events/history", defineRoute({ deps: testDeps, handler: eventsHistoryHandler }))
	.get("/api/logs", defineRoute({ deps: testDeps, handler: logsHandler }));

export const eventsHistoryRoute = { app, testApp } satisfies RouteModule<typeof app>;
