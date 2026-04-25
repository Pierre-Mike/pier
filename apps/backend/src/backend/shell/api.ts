import { Hono } from "hono";
import type { AppBindings } from "./bindings.ts";
import { healthRoute } from "./routes/health.ts";
import { versionRoute } from "./routes/version.ts";

const app = new Hono<{ Bindings: AppBindings }>()
	.route("/", healthRoute.app)
	.route("/", versionRoute.app);

export type AppType = typeof app;
export default app;
