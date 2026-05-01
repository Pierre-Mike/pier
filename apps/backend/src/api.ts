import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { artifactsBlobRoute } from "./features/artifacts/artifacts.blob.routes.ts";
import { artifactsRoute } from "./features/artifacts/artifacts.routes.ts";
import { streamArtifactsRoute } from "./features/artifacts/artifacts.stream.routes.ts";
import { configRoute } from "./features/config/config.routes.ts";
import { eventsHistoryRoute } from "./features/events/events.history.routes.ts";
import { streamReloadRoute } from "./features/events/events.reload.routes.ts";
import { streamEventsRoute } from "./features/events/events.stream.routes.ts";
import { healthRoute } from "./features/health/health.routes.ts";
import { projectsBlobRoute } from "./features/projects/projects.blob.routes.ts";
import { projectsDropRoute } from "./features/projects/projects.drop.routes.ts";
import { projectsRoute } from "./features/projects/projects.routes.ts";
import { sessionsRoute } from "./features/sessions/sessions.routes.ts";
import { settingsRoute } from "./features/settings/settings.routes.ts";
import { tunnelRoute } from "./features/tunnel/tunnel.routes.ts";
import { versionRoute } from "./features/version/version.routes.ts";
import { zellijProxyRoute } from "./features/zellij/zellij.routes.ts";
import type { AppBindings } from "./platform/bindings.ts";
import { localhostGuard, setSecurityHeaders } from "./platform/security.ts";

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
// in the frontend hc<AppType> client.
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
