import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppBindings } from "./platform/bindings.ts";
import { localhostGuard, setSecurityHeaders } from "./platform/security.ts";
import { artifactsRoute } from "./shell/routes/artifacts.ts";
import { artifactsBlobRoute } from "./shell/routes/artifacts-blob.ts";
import { configRoute } from "./shell/routes/config.ts";
import { eventsHistoryRoute } from "./shell/routes/events-history.ts";
import { healthRoute } from "./shell/routes/health.ts";
import { projectsRoute } from "./shell/routes/projects.ts";
import { projectsBlobRoute } from "./shell/routes/projects-blob.ts";
import { projectsDropRoute } from "./shell/routes/projects-drop.ts";
import { sessionsRoute } from "./shell/routes/sessions.ts";
import { settingsRoute } from "./shell/routes/settings.ts";
import { streamArtifactsRoute } from "./shell/routes/stream-artifacts.ts";
import { streamEventsRoute } from "./shell/routes/stream-events.ts";
import { streamReloadRoute } from "./shell/routes/stream-reload.ts";
import { tunnelRoute } from "./shell/routes/tunnel.ts";
import { versionRoute } from "./shell/routes/version.ts";
import { zellijProxyRoute } from "./shell/routes/zellij-proxy.ts";

const app = new Hono<{ Bindings: AppBindings }>();

// CORS for the local frontend (Astro on :5274). Restrict to loopback origins
// to match the localhostGuard policy — same allowlist style.
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
app.use(
	"*",
	cors({
		origin: (o) => (o && LOOPBACK_ORIGIN.test(o) ? o : ""),
		credentials: true,
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type"],
	}),
);
app.use("*", localhostGuard);
app.use("*", async (c, next) => {
	await next();
	// /zellij/* is a reverse proxy to the local zellij web server. Its responses
	// are designed to be embedded in pier's iframe, so they must not carry our
	// default `X-Frame-Options: SAMEORIGIN` (frontend and backend are on
	// different ports, which counts as cross-origin for XFO).
	if (!c.req.path.startsWith("/zellij/")) {
		setSecurityHeaders(c);
	}
});

// Capture the chained type so AppType reflects every mounted route — Hono RPC
// inference depends on the return value of `.route()`. Discarding the chain
// (a previous bug) made AppType the empty Hono and `client.health` etc. unknown
// at the api-contract boundary.
const routedApp = app
	.route("/", healthRoute.app)
	.route("/", versionRoute.app)
	.route("/", configRoute.app)
	.route("/", projectsRoute.app)
	.route("/", projectsDropRoute.app)
	.route("/", projectsBlobRoute.app)
	.route("/", sessionsRoute.app)
	.route("/", zellijProxyRoute.app)
	.route("/", artifactsRoute.app)
	.route("/", artifactsBlobRoute.app)
	.route("/", eventsHistoryRoute.app)
	.route("/", streamEventsRoute.app)
	.route("/", streamArtifactsRoute.app)
	.route("/", streamReloadRoute.app)
	.route("/", settingsRoute.app)
	.route("/", tunnelRoute.app);

// Serve the built frontend (apps/frontend/dist) as a fallback for any GET that
// no API route handled. No-op when dist/ is missing (pure dev with Astro on
// :5274), active when frontend has been built (single-origin / tunnel mode).
const FRONTEND_DIST = join(import.meta.dir, "..", "..", "frontend", "dist");
if (await Bun.file(join(FRONTEND_DIST, "index.html")).exists()) {
	routedApp.get("*", async (c) => {
		const path = new URL(c.req.url).pathname;
		const requested = path === "/" ? "/index.html" : path;
		const filePath = join(FRONTEND_DIST, requested);
		if (!filePath.startsWith(`${FRONTEND_DIST}/`) && filePath !== FRONTEND_DIST) {
			return c.notFound();
		}
		const file = Bun.file(filePath);
		if (await file.exists()) {
			return new Response(file, { headers: { "Content-Type": file.type } });
		}
		return c.notFound();
	});
}

export type AppType = typeof routedApp;
export default routedApp;
