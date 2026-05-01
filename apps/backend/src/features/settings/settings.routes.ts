/**
 * Settings route — exposes pier configuration endpoints.
 *
 * GET /settings/zellij-readonly
 *   Returns a read-only zellij watcher URL with the token in the URL fragment
 *   so it never appears in server logs. Restricted to loopback callers via
 *   localhostGuard (enforced on both app and testApp).
 *
 * The zellij read-only token is supplied via Effect's Layer system
 * (ZellijAuthService). Tests inject a stub layer through buildSettingsTestApp().
 */
import { Effect, type Layer } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { type RouteModule, route, routeAdvanced } from "../../platform/route-kit.ts";
import { localhostGuard } from "../../platform/security.ts";
import { ZellijAuthLive, ZellijAuthService, ZellijAuthTest } from "../zellij/zellij.auth.repo.ts";

const DEFAULT_ZELLIJ_ORIGIN = "https://127.0.0.1:8082";

const READONLY_TOKEN_NAME = "zellij-readonly-token";

const zellijReadonlyHandler = (c: Context<{ Bindings: AppBindings }>) =>
	Effect.gen(function* () {
		const auth = yield* ZellijAuthService;
		const token = yield* auth.getReadOnlyToken();
		const base = process.env["PIGUY_ZELLIJ_URL"] ?? DEFAULT_ZELLIJ_ORIGIN;
		const url = `${base}#token=${token}`;
		return c.json({ access: "read-only", mode: "watch", url, tokenName: READONLY_TOKEN_NAME }, 200);
	});

const r = route({
	deps: { live: ZellijAuthLive, test: ZellijAuthTest },
	handler: zellijReadonlyHandler,
});

const app = new Hono<{ Bindings: AppBindings }>()
	.use("/settings/*", localhostGuard)
	.get("/settings/zellij-readonly", r.live);

/**
 * Build a test-style settings Hono app with a caller-supplied ZellijAuthService
 * layer. Tests use this to inject a Layer.succeed stub (no mock.module needed).
 *
 * The leading middleware injects a `host: localhost` header when bun's request
 * stub omits one — without it, localhostGuard would 403 every request.
 */
export const buildSettingsTestApp = (layer: Layer.Layer<ZellijAuthService>) => {
	const ra = routeAdvanced({
		liveDeps: layer,
		testDeps: layer,
		handler: zellijReadonlyHandler,
	});
	return new Hono<{ Bindings: AppBindings }>()
		.use("/settings/*", async (c, next) => {
			if (!c.req.header("host")) {
				c.req.raw.headers.set("host", "localhost");
			}
			await next();
		})
		.use("/settings/*", localhostGuard)
		.get("/settings/zellij-readonly", ra.live);
};

const testApp = buildSettingsTestApp(ZellijAuthTest);

export const settingsRoute = { app, testApp } satisfies RouteModule<typeof app>;
