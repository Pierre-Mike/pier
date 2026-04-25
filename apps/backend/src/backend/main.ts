/**
 * Composition root — local Bun.serve entry point.
 */
import app from "./shell/api.ts";

const port = Number(process.env.PIGUY_PORT ?? 5273);

Bun.serve({
	port,
	hostname: "127.0.0.1",
	fetch: app.fetch,
});

console.log(`[piguy-web] listening on http://127.0.0.1:${port}`);

export default app;
