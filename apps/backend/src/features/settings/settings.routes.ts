/**
 * Settings route — exposes pier configuration endpoints.
 *
 * GET /settings/zellij-readonly
 *   Returns a read-only zellij watcher URL with the token in the URL fragment
 *   so it never appears in server logs. Restricted to loopback callers via
 *   localhostGuard (enforced on both app and testApp).
 */
import type { Context } from "hono";
import { Hono } from "hono";
import { getZellijReadOnlyToken } from "../../infra/zellij-auth.ts";
import type { AppBindings } from "../../platform/bindings.ts";
import type { RouteModule } from "../../platform/route-types.ts";
import { localhostGuard } from "../../platform/security.ts";

const DEFAULT_ZELLIJ_ORIGIN = "https://127.0.0.1:8082";

/** Basename of the readonly-token cache file — informative tokenName for callers. */
const READONLY_TOKEN_NAME = "zellij-readonly-token";

const zellijReadonlyHandler = async (c: Context<{ Bindings: AppBindings }>): Promise<Response> => {
	const token = await getZellijReadOnlyToken();
	const base = process.env["PIGUY_ZELLIJ_URL"] ?? DEFAULT_ZELLIJ_ORIGIN;
	const url = `${base}#token=${token}`;
	return c.json({ access: "read-only", mode: "watch", url, tokenName: READONLY_TOKEN_NAME }, 200);
};

const app = new Hono<{ Bindings: AppBindings }>()
	.use("/settings/*", localhostGuard)
	.get("/settings/zellij-readonly", zellijReadonlyHandler);

const testApp = new Hono<{ Bindings: AppBindings }>()
	.use("/settings/*", async (c, next) => {
		// In tests, requests with no Host header originate from loopback.
		// Inject a default so localhostGuard passes.
		if (!c.req.header("host")) {
			c.req.raw.headers.set("host", "localhost");
		}
		await next();
	})
	.use("/settings/*", localhostGuard)
	.get("/settings/zellij-readonly", zellijReadonlyHandler);

export const settingsRoute = { app, testApp } satisfies RouteModule<typeof app>;
