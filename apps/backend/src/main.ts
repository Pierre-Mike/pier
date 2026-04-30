/**
 * Composition root — boots pier backend with full Effect-TS Layer composition.
 */
import { Effect, Layer } from "effect";
import app from "./api.ts";
import {
	ArtifactWatcher,
	makeArtifactWatcherLive,
} from "./features/artifacts/artifacts.watcher.repo.ts";
import {
	ClaudeEventStream,
	makeClaudeEventStreamLive,
} from "./features/events/events.claude.repo.ts";
import { ensureZellijWeb } from "./infra/zellij-auth.ts";
import {
	handleZellijWsUpgrade,
	type ZellijWsBridge,
	zellijWsHandlers,
} from "./infra/zellij-ws-proxy.ts";
import { stopTunnel } from "./platform/cloudflared.ts";
import { ConfigService, makeConfigLayer } from "./platform/config.repo.ts";
import { createSandboxApp } from "./platform/sandbox-app.ts";
import { makeArtifactBusLive, makeEventBusLive } from "./platform/sse-bus.ts";

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

	yield* Effect.tryPromise(() => ensureZellijWeb(cfg.zellijWebUrl, { cwd: cfg.projectsRoot })).pipe(
		Effect.tapError((err) =>
			Effect.sync(() => {
				// biome-ignore lint/suspicious/noConsole: startup warning is diagnostic
				console.warn(`[pier] zellij web not ready: ${String(err)}`);
			}),
		),
		Effect.orElseSucceed(() => undefined),
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
	console.log(`[pier] listening on http://127.0.0.1:${cfg.appPort}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[pier]   projects root: ${cfg.projectsRoot}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[pier]   artifacts:     ${cfg.artifactsDir}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[pier]   claude logs:   ${cfg.claudeProjectsRoot}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[pier]   zellij web:    ${cfg.zellijWebUrl}`);
	// biome-ignore lint/suspicious/noConsole: startup logs are diagnostic, not debugging
	console.log(`[pier]   sandbox on:    http://127.0.0.1:${cfg.sandboxPort}`);

	Bun.serve<ZellijWsBridge>({
		port: cfg.appPort,
		hostname: "127.0.0.1",
		fetch: (req, server) => {
			const url = new URL(req.url);
			if (
				url.pathname.startsWith("/zellij/ws") &&
				req.headers.get("upgrade")?.toLowerCase() === "websocket"
			) {
				return handleZellijWsUpgrade({ req, server, zellijUrl: cfg.zellijWebUrl });
			}
			return app.fetch(req);
		},
		websocket: zellijWsHandlers,
	});
});

Effect.runPromise(program).catch((err) => {
	// biome-ignore lint/suspicious/noConsole: boot error must be logged before exit
	console.error("[pier] boot failed:", err);
	process.exit(1);
});

// Take any active cloudflared subprocess down with us.
const shutdown = (signal: NodeJS.Signals): void => {
	void stopTunnel().finally(() => {
		process.kill(process.pid, signal);
	});
};
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

export default app;
