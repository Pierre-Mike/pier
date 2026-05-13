/**
 * Hono routes for the agents feature.
 *
 * GET  /api/agents                → AgentRow[]           (list all)
 * POST /api/agents                → { id, shortId }      (dispatch)
 * GET  /api/agents/:id/peek       → peek data            (state + tail)
 * POST /api/agents/:id/stop       → 204
 * POST /api/agents/:id/respawn    → 204
 * POST /api/agents/:id/delete     → 204
 *
 * Returns 409 if roster.json is absent (daemon not running).
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, routeAdvanced } from "../../platform/route-kit.ts";
import {
	AgentControl,
	type AgentControlService,
	makeAgentControlLive,
	makeAgentControlTest,
} from "./agents.control.repo.ts";
import {
	AgentDaemon,
	type AgentDaemonService,
	makeAgentDaemonLive,
	makeAgentDaemonTest,
} from "./agents.daemon.repo.ts";
import {
	AgentDispatch,
	type AgentDispatchService,
	type DispatchArgs,
	makeAgentDispatchLive,
	makeAgentDispatchTest,
} from "./agents.dispatch.repo.ts";

type AnyCtx = Context<{ Bindings: AppBindings }>;

const JOBS_DIR = join(homedir(), ".claude", "jobs");

// ---------------------------------------------------------------------------
// Combined service type for all agent handlers
// ---------------------------------------------------------------------------

type AgentServices = AgentDaemonService | AgentDispatchService | AgentControlService;

// ---------------------------------------------------------------------------
// GET /api/agents
// ---------------------------------------------------------------------------

const listAgentsHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const daemon = yield* AgentDaemon;
		const result = yield* daemon.listAgents();
		if (!Array.isArray(result)) {
			if (result._tag === "DaemonAbsent") {
				return c.json({ error: "daemon not running" }, 409);
			}
			if (result._tag === "DaemonRosterUnreadable") {
				return c.json(
					{ error: "roster shape unrecognized — check CLI version", details: result.details },
					502,
				);
			}
		}
		return c.json(result, 200);
	});

// ---------------------------------------------------------------------------
// POST /api/agents — helpers
// ---------------------------------------------------------------------------

const strField = (body: Record<string, unknown>, key: string): string | undefined =>
	typeof body[key] === "string" ? (body[key] as string) : undefined;

const buildDispatchArgs = (body: Record<string, unknown>): DispatchArgs | null => {
	const prompt = body["prompt"];
	if (typeof prompt !== "string" || !prompt.trim()) return null;
	return {
		prompt,
		...(strField(body, "cwd") !== undefined ? { cwd: strField(body, "cwd") } : {}),
		...(strField(body, "agent") !== undefined ? { agent: strField(body, "agent") } : {}),
		...(strField(body, "model") !== undefined ? { model: strField(body, "model") } : {}),
		...(strField(body, "permissionMode") !== undefined
			? { permissionMode: strField(body, "permissionMode") }
			: {}),
	};
};

// ---------------------------------------------------------------------------
// POST /api/agents
// ---------------------------------------------------------------------------

const dispatchAgentHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const daemon = yield* AgentDaemon;
		const rosterRaw = yield* daemon.readRoster();
		if (rosterRaw === null) {
			return c.json({ error: "claude daemon not running or roster.json absent" }, 409);
		}

		let body: Record<string, unknown>;
		try {
			body = (yield* Effect.promise(() => c.req.json())) as Record<string, unknown>;
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const dispatchArgs = buildDispatchArgs(body);
		if (dispatchArgs === null) {
			return c.json({ error: "prompt is required" }, 400);
		}

		const dispatch = yield* AgentDispatch;
		const dispatchResult = yield* dispatch
			.dispatch(dispatchArgs)
			.pipe(Effect.catchAll((e) => Effect.succeed({ _error: e.message })));

		if ("_error" in dispatchResult) {
			return c.json({ error: dispatchResult._error }, 500);
		}

		return c.json(dispatchResult, 200);
	});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/peek
// ---------------------------------------------------------------------------

const peekAgentHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const shortId = c.req.param("id") ?? "";
		if (!shortId) return c.json({ error: "id required" }, 400);

		const daemon = yield* AgentDaemon;
		const stateRaw = yield* daemon.readState(shortId);
		if (stateRaw === null) {
			return c.json({ error: "agent not found" }, 404);
		}

		const timelinePath = join(JOBS_DIR, shortId, "timeline.jsonl");
		const tail = yield* Effect.promise(async () => {
			try {
				const raw = await readFile(timelinePath, "utf-8");
				const lines = raw.split("\n").filter(Boolean);
				return lines.slice(-20).join("\n");
			} catch {
				return "";
			}
		});

		return c.json(
			{
				state: stateRaw["state"],
				needs: stateRaw["needs"] ?? null,
				output: stateRaw["output"] ?? null,
				tail,
			},
			200,
		);
	});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/stop
// ---------------------------------------------------------------------------

const stopAgentHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const shortId = c.req.param("id") ?? "";
		if (!shortId) return c.json({ error: "id required" }, 400);
		const control = yield* AgentControl;
		yield* control.stop(shortId).pipe(Effect.catchAll(() => Effect.void));
		return new Response(null, { status: 204 });
	});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/respawn
// ---------------------------------------------------------------------------

const respawnAgentHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const shortId = c.req.param("id") ?? "";
		if (!shortId) return c.json({ error: "id required" }, 400);
		const control = yield* AgentControl;
		yield* control.respawn(shortId).pipe(Effect.catchAll(() => Effect.void));
		return new Response(null, { status: 204 });
	});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/delete
// ---------------------------------------------------------------------------

const deleteAgentHandler = (c: AnyCtx): Effect.Effect<Response, never, AgentServices> =>
	Effect.gen(function* () {
		const shortId = c.req.param("id") ?? "";
		if (!shortId) return c.json({ error: "id required" }, 400);
		const control = yield* AgentControl;
		yield* control.rm(shortId).pipe(Effect.catchAll(() => Effect.void));
		return new Response(null, { status: 204 });
	});

// ---------------------------------------------------------------------------
// Route builder helper
// ---------------------------------------------------------------------------

const buildAgentApp = (
	layer: Layer.Layer<AgentServices>,
	half: "live" | "test",
): Hono<{ Bindings: AppBindings }> => {
	const mk = (handler: (c: AnyCtx) => Effect.Effect<Response, never, AgentServices>) => {
		const pair = routeAdvanced({ liveDeps: layer, testDeps: layer, handler });
		return half === "live" ? pair.live : pair.test;
	};

	return new Hono<{ Bindings: AppBindings }>()
		.get("/api/agents", mk(listAgentsHandler))
		.post("/api/agents", mk(dispatchAgentHandler))
		.get("/api/agents/:id/peek", mk(peekAgentHandler))
		.post("/api/agents/:id/stop", mk(stopAgentHandler))
		.post("/api/agents/:id/respawn", mk(respawnAgentHandler))
		.post("/api/agents/:id/delete", mk(deleteAgentHandler));
};

// ---------------------------------------------------------------------------
// Route module (live + test halves)
// ---------------------------------------------------------------------------

const liveLayer: Layer.Layer<AgentServices> = Layer.mergeAll(
	makeAgentDaemonLive(),
	makeAgentDispatchLive(),
	makeAgentControlLive(),
);

const app = buildAgentApp(liveLayer, "live");
const testApp = buildAgentApp(liveLayer, "test");

export const agentsRoute = { app, testApp } satisfies RouteModule<typeof app>;

// ---------------------------------------------------------------------------
// makeAgentsTestApp: injectable test factory for integration tests
// ---------------------------------------------------------------------------

export const makeAgentsTestApp = (opts: {
	readonly rosterJson: unknown;
	readonly stateByShortId: Record<string, unknown>;
	readonly spawnStdout?: string | undefined;
}): Hono<{ Bindings: AppBindings }> => {
	const testLayer: Layer.Layer<AgentServices> = Layer.mergeAll(
		makeAgentDaemonTest(opts),
		makeAgentDispatchTest(opts),
		makeAgentControlTest(),
	);
	return buildAgentApp(testLayer, "test");
};
