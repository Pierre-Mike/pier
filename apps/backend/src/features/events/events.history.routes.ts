import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { ConfigTest, defaultConfigLayer } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { mountPair, type RouteModule, routeAdvanced } from "../../platform/route-kit.ts";
import { EventBus, makeEventBusLive } from "../../platform/sse-bus.ts";
import {
	ClaudeEventStream,
	ClaudeEventStreamTest,
	makeClaudeEventStreamLive,
} from "./events.claude.repo.ts";

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

const rHistory = routeAdvanced({
	liveDeps: () => {
		const cfg = defaultConfigLayer;
		const bus = makeEventBusLive();
		const stream = Layer.provide(makeClaudeEventStreamLive(), Layer.merge(bus, cfg));
		return Layer.merge(bus, stream);
	},
	testDeps: (() => {
		const bus = makeEventBusLive();
		const stream = Layer.provide(ClaudeEventStreamTest, Layer.merge(bus, ConfigTest));
		return Layer.merge(bus, stream);
	})(),
	handler: eventsHistoryHandler,
});

const rLogs = routeAdvanced({
	liveDeps: () => {
		const cfg = defaultConfigLayer;
		const bus = makeEventBusLive();
		const stream = Layer.provide(makeClaudeEventStreamLive(), Layer.merge(bus, cfg));
		return Layer.merge(bus, stream);
	},
	testDeps: (() => {
		const bus = makeEventBusLive();
		const stream = Layer.provide(ClaudeEventStreamTest, Layer.merge(bus, ConfigTest));
		return Layer.merge(bus, stream);
	})(),
	handler: logsHandler,
});

const { app, testApp } = mountPair((a, h) =>
	a.get("/api/events/history", rHistory[h]).get("/api/logs", rLogs[h]),
);

export const eventsHistoryRoute = { app, testApp } satisfies RouteModule<typeof app>;
