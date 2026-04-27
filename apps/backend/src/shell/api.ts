import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppBindings } from "./bindings.ts";
import { artifactsRoute } from "./routes/artifacts.ts";
import { artifactsBlobRoute } from "./routes/artifacts-blob.ts";
import { configRoute } from "./routes/config.ts";
import { eventsHistoryRoute } from "./routes/events-history.ts";
import { healthRoute } from "./routes/health.ts";
import { projectsRoute } from "./routes/projects.ts";
import { projectsBlobRoute } from "./routes/projects-blob.ts";
import { projectsDropRoute } from "./routes/projects-drop.ts";
import { sessionsRoute } from "./routes/sessions.ts";
import { settingsRoute } from "./routes/settings.ts";
import { streamArtifactsRoute } from "./routes/stream-artifacts.ts";
import { streamEventsRoute } from "./routes/stream-events.ts";
import { streamReloadRoute } from "./routes/stream-reload.ts";
import { versionRoute } from "./routes/version.ts";
import { zellijProxyRoute } from "./routes/zellij-proxy.ts";
import { localhostGuard, setSecurityHeaders } from "./security.ts";

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
	.route("/", settingsRoute.app);

export type AppType = typeof routedApp;
export default routedApp;
