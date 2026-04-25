/**
 * Composition root — boots piguy-web v2 backend with full Effect-TS Layer composition.
 */
import { Effect, Layer } from "effect";
import { ArtifactWatcher, makeArtifactWatcherLive } from "./infra/artifact-watcher.ts";
import { ClaudeEventStream, makeClaudeEventStreamLive } from "./infra/claude-events.ts";
import { ConfigService, makeConfigLayer } from "./infra/config.ts";
import { makeArtifactBusLive, makeEventBusLive } from "./infra/sse-bus.ts";
import app from "./shell/api.ts";
import { createSandboxApp } from "./shell/sandbox-app.ts";

const program = Effect.gen(function* () {
	const env = process.env["NODE_ENV"];
	const configLayer = makeConfigLayer(env !== undefined ? { ENVIRONMENT: env } : {});
	const cfg = yield* Effect.provide(
		Effect.gen(function* () {
			const svc = yield* ConfigService;
			return yield* svc.get();
		}),
		configLayer,
	);

	yield* Effect.provide(
		Effect.gen(function* () {
			const artifactWatcher = yield* ArtifactWatcher;
			yield* artifactWatcher.start();
		}),
		Layer.provide(makeArtifactWatcherLive(), Layer.merge(makeArtifactBusLive(), configLayer)),
	);

	yield* Effect.provide(
		Effect.gen(function* () {
			const claudeStream = yield* ClaudeEventStream;
			yield* claudeStream.start();
		}),
		Layer.provide(makeClaudeEventStreamLive(), Layer.merge(makeEventBusLive(), configLayer)),
	);

	const sandboxApp = createSandboxApp({
		artifactsDir: cfg.artifactsDir,
		appPort: cfg.appPort,
	});

	Bun.serve({
		port: cfg.sandboxPort,
		hostname: "127.0.0.1",
		fetch: sandboxApp.fetch,
	});

	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web] listening on http://127.0.0.1:${cfg.appPort}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web]   projects root: ${cfg.projectsRoot}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web]   artifacts:     ${cfg.artifactsDir}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web]   claude logs:   ${cfg.claudeProjectsRoot}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web]   zellij web:    ${cfg.zellijWebUrl}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[piguy-web]   sandbox on:    http://127.0.0.1:${cfg.sandboxPort}`);

	Bun.serve({
		port: cfg.appPort,
		hostname: "127.0.0.1",
		fetch: app.fetch,
	});
});

Effect.runPromise(program).catch((err) => {
	// biome-ignore lint/suspicious/noConsole: boot error must be logged before exit
	console.error("[piguy-web] boot failed:", err);
	process.exit(1);
});

export default app;
