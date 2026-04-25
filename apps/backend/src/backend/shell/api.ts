import { Hono } from "hono";
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
import { versionRoute } from "./routes/version.ts";
import { localhostGuard, setSecurityHeaders } from "./security.ts";

const app = new Hono<{ Bindings: AppBindings }>();

app.use("*", localhostGuard);
app.use("*", async (c, next) => {
	await next();
	setSecurityHeaders(c);
});

app
	.route("/", healthRoute.app)
	.route("/", versionRoute.app)
	.route("/", configRoute.app)
	.route("/", projectsRoute.app)
	.route("/", projectsDropRoute.app)
	.route("/", projectsBlobRoute.app)
	.route("/", sessionsRoute.app)
	.route("/", artifactsRoute.app)
	.route("/", artifactsBlobRoute.app)
	.route("/", eventsHistoryRoute.app);

export type AppType = typeof app;
export default app;
