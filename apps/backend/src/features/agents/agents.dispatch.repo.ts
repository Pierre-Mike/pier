/**
 * Effect service: dispatches a background agent via `claude --bg "<prompt>"`.
 * Parses the short ID from the CLI output: `backgrounded · <8-hex-short>`.
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface DispatchArgs {
	readonly prompt: string;
	readonly cwd?: string | undefined;
	readonly agent?: string | undefined;
	readonly model?: string | undefined;
	readonly permissionMode?: string | undefined;
}

export interface DispatchResult {
	readonly id: string;
	readonly shortId: string;
}

export interface AgentDispatchService {
	readonly dispatch: (args: DispatchArgs) => Effect.Effect<DispatchResult, Error, never>;
}

export const AgentDispatch = Context.GenericTag<AgentDispatchService>("AgentDispatch");

// ---------------------------------------------------------------------------
// Parse `backgrounded · <shortId>` from CLI stdout
// The bullet character (·) is U+00B7 MIDDLE DOT
// ---------------------------------------------------------------------------

export const parseBackgroundedOutput = (stdout: string): string | null => {
	const match = stdout.match(/backgrounded\s*[·•*]\s*([0-9a-f]{8})/i);
	return match?.[1] ?? null;
};

// ---------------------------------------------------------------------------
// Live implementation — spawns `claude --bg`
// ---------------------------------------------------------------------------

const spawnClaude = async (args: DispatchArgs): Promise<string> => {
	const claudeArgs = ["--bg", args.prompt];
	if (args.agent !== undefined) claudeArgs.push("--agent", args.agent);
	if (args.model !== undefined) claudeArgs.push("--model", args.model);

	const proc =
		args.cwd !== undefined
			? Bun.spawn(["claude", ...claudeArgs], { cwd: args.cwd, stdout: "pipe", stderr: "pipe" })
			: Bun.spawn(["claude", ...claudeArgs], { stdout: "pipe", stderr: "pipe" });

	const stdoutStream = proc.stdout;
	const stdout =
		stdoutStream instanceof ReadableStream ? await new Response(stdoutStream).text() : "";
	await proc.exited;
	return stdout;
};

export const makeAgentDispatchLive = (): Layer.Layer<AgentDispatchService> =>
	Layer.succeed(AgentDispatch, {
		dispatch: (args) =>
			Effect.tryPromise({
				try: async () => {
					const stdout = await spawnClaude(args);
					const shortId = parseBackgroundedOutput(stdout);
					if (!shortId) {
						throw new Error(
							`claude --bg did not output expected format. Got: ${stdout.slice(0, 200)}`,
						);
					}
					return { id: randomUUID(), shortId };
				},
				catch: (e) => (e instanceof Error ? e : new Error(String(e))),
			}),
	});

// ---------------------------------------------------------------------------
// Test stub — returns a fixed shortId from injected stdout
// ---------------------------------------------------------------------------

export const makeAgentDispatchTest = (opts: {
	readonly spawnStdout?: string | undefined;
}): Layer.Layer<AgentDispatchService> =>
	Layer.succeed(AgentDispatch, {
		dispatch: (_args) =>
			Effect.gen(function* () {
				const stdout = opts.spawnStdout ?? "backgrounded · 00000000";
				const shortId = parseBackgroundedOutput(stdout);
				if (!shortId) {
					return yield* Effect.fail(new Error(`Test stub: bad spawnStdout: ${stdout}`));
				}
				return { id: randomUUID(), shortId };
			}),
	});
