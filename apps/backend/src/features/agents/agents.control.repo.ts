/**
 * Effect service: controls background agents via CLI.
 * Provides stop / respawn / rm / logs operations.
 */

import { Context, Effect, Layer } from "effect";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface AgentControlService {
	readonly stop: (shortId: string) => Effect.Effect<void, Error, never>;
	readonly respawn: (shortId: string) => Effect.Effect<void, Error, never>;
	readonly rm: (shortId: string) => Effect.Effect<void, Error, never>;
	readonly logs: (shortId: string) => Effect.Effect<string, Error, never>;
}

export const AgentControl = Context.GenericTag<AgentControlService>("AgentControl");

// ---------------------------------------------------------------------------
// Shared spawn helper
// ---------------------------------------------------------------------------

const spawnClaude = async (args: readonly string[]): Promise<string> => {
	const proc = Bun.spawn(["claude", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`claude ${args[0]} exited ${exitCode}: ${stderr.slice(0, 200)}`);
	}
	return stdout;
};

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const makeAgentControlLive = (): Layer.Layer<AgentControlService> =>
	Layer.succeed(AgentControl, {
		stop: (shortId) =>
			Effect.tryPromise({
				try: async () => {
					await spawnClaude(["stop", shortId]);
				},
				catch: (e) => (e instanceof Error ? e : new Error(String(e))),
			}),

		respawn: (shortId) =>
			Effect.tryPromise({
				try: async () => {
					await spawnClaude(["respawn", shortId]);
				},
				catch: (e) => (e instanceof Error ? e : new Error(String(e))),
			}),

		rm: (shortId) =>
			Effect.tryPromise({
				try: async () => {
					await spawnClaude(["rm", shortId]);
				},
				catch: (e) => (e instanceof Error ? e : new Error(String(e))),
			}),

		logs: (shortId) =>
			Effect.tryPromise({
				try: () => spawnClaude(["logs", shortId]),
				catch: (e) => (e instanceof Error ? e : new Error(String(e))),
			}),
	});

// ---------------------------------------------------------------------------
// Test stub — no-op for all operations
// ---------------------------------------------------------------------------

export const makeAgentControlTest = (): Layer.Layer<AgentControlService> =>
	Layer.succeed(AgentControl, {
		stop: (_shortId) => Effect.void,
		respawn: (_shortId) => Effect.void,
		rm: (_shortId) => Effect.void,
		logs: (_shortId) => Effect.succeed(""),
	});
