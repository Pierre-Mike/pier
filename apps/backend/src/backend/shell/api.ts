import { Hono } from "hono";
import { makeConfigLayer } from "../infra/config.ts";
import type { AppBindings } from "./bindings.ts";
import { artifactsRoute } from "./routes/artifacts.ts";
import { configRoute } from "./routes/config.ts";
import { eventsHistoryRoute } from "./routes/events-history.ts";
import { healthRoute } from "./routes/health.ts";
import { projectsRoute } from "./routes/projects.ts";
import { sessionsRoute } from "./routes/sessions.ts";
import { versionRoute } from "./routes/version.ts";
import { localhostGuard, setSecurityHeaders } from "./security.ts";

const app = new Hono<{ Bindings: AppBindings }>();

app.use("*", localhostGuard);
app.use("*", async (c, next) => {
	c.env.makeConfigLayer = makeConfigLayer(c.env);
	await next();
	setSecurityHeaders(c);
});

app
	.route("/", healthRoute.app)
	.route("/", versionRoute.app)
	.route("/", configRoute.app)
	.route("/", projectsRoute.app)
	.route("/", sessionsRoute.app)
	.route("/", artifactsRoute.app)
	.route("/", eventsHistoryRoute.app);

export type AppType = typeof app;
export default app;
