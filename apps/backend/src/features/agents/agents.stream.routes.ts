/**
 * SSE endpoint: GET /api/agents/stream
 *
 * Emits AgentRow[] delta events whenever the daemon state changes.
 * Uses node:fs watch on ~/.claude/jobs/ and ~/.claude/daemon/roster.json.
 *
 * Event format: event: agents\ndata: <JSON AgentRow[]>
 */

import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, type Layer } from "effect";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppBindings } from "../../platform/effect-handler.ts";
import type { RouteModule } from "../../platform/route-kit.ts";
import type { AgentDaemonService } from "./agents.daemon.repo.ts";
import { AgentDaemon, makeAgentDaemonLive, makeAgentDaemonTest } from "./agents.daemon.repo.ts";

const CLAUDE_DIR = join(homedir(), ".claude");
const JOBS_DIR = join(CLAUDE_DIR, "jobs");
const DAEMON_DIR = join(CLAUDE_DIR, "daemon");

// ---------------------------------------------------------------------------
// Helper: read current agent rows via Effect layer
// ---------------------------------------------------------------------------

const readAgentRows = async (layer: Layer.Layer<AgentDaemonService>): Promise<unknown[]> => {
	try {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const daemon = yield* AgentDaemon;
				return yield* daemon.listAgents();
			}).pipe(Effect.provide(layer)),
		);
		if (Array.isArray(result)) return result;
		return [];
	} catch {
		return [];
	}
};

// ---------------------------------------------------------------------------
// Build SSE app with injectable layer
// ---------------------------------------------------------------------------

const buildStreamApp = (
	layer: Layer.Layer<AgentDaemonService>,
): Hono<{ Bindings: AppBindings }> => {
	const app = new Hono<{ Bindings: AppBindings }>();

	app.get("/api/agents/stream", (c) =>
		streamSSE(c, async (stream) => {
			let closed = false;
			const watchers: ReturnType<typeof watch>[] = [];

			try {
				// Send initial state
				const initial = await readAgentRows(layer);
				await stream.writeSSE({ data: JSON.stringify(initial), event: "agents" });

				let debounceTimer: ReturnType<typeof setTimeout> | null = null;

				const emit = async () => {
					if (closed) return;
					const rows = await readAgentRows(layer);
					try {
						await stream.writeSSE({ data: JSON.stringify(rows), event: "agents" });
					} catch {
						closed = true;
					}
				};

				const scheduleEmit = () => {
					if (debounceTimer !== null) clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						void emit();
					}, 150);
				};

				// Watch jobs dir and daemon dir (roster.json lives here)
				const tryWatch = (dir: string) => {
					try {
						const w = watch(dir, { recursive: true, persistent: true }, scheduleEmit);
						watchers.push(w);
					} catch {
						// Directory may not exist yet (daemon not started)
					}
				};

				tryWatch(JOBS_DIR);
				tryWatch(DAEMON_DIR);

				// Heartbeat keeps connection alive and detects disconnects
				await new Promise<void>((resolve) => {
					const heartbeat = setInterval(async () => {
						if (closed) {
							clearInterval(heartbeat);
							resolve();
							return;
						}
						try {
							await stream.writeSSE({ data: "", event: "heartbeat" });
						} catch {
							closed = true;
							clearInterval(heartbeat);
							resolve();
						}
					}, 15_000);
				});
			} finally {
				closed = true;
				for (const w of watchers) {
					try {
						w.close();
					} catch {
						// ignore
					}
				}
			}
		}),
	);

	return app;
};

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

const liveLayer = makeAgentDaemonLive();
const testLayer = makeAgentDaemonTest({ rosterJson: null, stateByShortId: {} });

const app = buildStreamApp(liveLayer);
const testApp = buildStreamApp(testLayer);

export const agentsStreamRoute = { app, testApp } satisfies RouteModule<typeof app>;
