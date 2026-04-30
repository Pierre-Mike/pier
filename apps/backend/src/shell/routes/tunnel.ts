/**
 * Tunnel route — start/stop/inspect a Cloudflare quick tunnel that exposes
 * pier publicly. Restricted to loopback callers (no remote toggling) so a
 * tunnel viewer cannot disable the tunnel from inside.
 */
import type { Context } from "hono";
import { Hono } from "hono";
import {
	getTunnelState,
	startTunnel,
	stopTunnel,
	type TunnelState,
} from "../../infra/cloudflared.ts";
import type { AppBindings } from "../../platform/bindings.ts";
import type { RouteModule } from "../../platform/route-types.ts";
import { strictLoopbackGuard } from "../../platform/security.ts";

const appPort = (): number => Number(process.env["PIGUY_PORT"] ?? 5273);

const respond = (c: Context<{ Bindings: AppBindings }>, state: TunnelState): Response =>
	c.json(state, 200);

const getHandler = (c: Context<{ Bindings: AppBindings }>): Response =>
	respond(c, getTunnelState());

const startHandler = async (c: Context<{ Bindings: AppBindings }>): Promise<Response> => {
	const next = await startTunnel(appPort());
	return respond(c, next);
};

const stopHandler = async (c: Context<{ Bindings: AppBindings }>): Promise<Response> => {
	const next = await stopTunnel();
	return respond(c, next);
};

const buildApp = () =>
	new Hono<{ Bindings: AppBindings }>()
		.use("/api/tunnel", strictLoopbackGuard)
		.use("/api/tunnel/*", strictLoopbackGuard)
		.get("/api/tunnel", getHandler)
		.post("/api/tunnel/start", startHandler)
		.post("/api/tunnel/stop", stopHandler);

const app = buildApp();
const testApp = buildApp();

export const tunnelRoute = { app, testApp } satisfies RouteModule<typeof app>;
