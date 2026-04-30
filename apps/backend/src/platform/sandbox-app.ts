/**
 * Separate-origin sandbox server for rendering untrusted HTML artifacts.
 *
 * Runs on a distinct port (config.sandboxPort) so the browser's Same-Origin
 * Policy isolates its localStorage, cookies, and fetch from the main dashboard.
 *
 * The main app embeds artifacts via:
 *   <iframe src="http://127.0.0.1:<sandboxPort>/artifact?id=<path>"
 *           sandbox="allow-scripts"></iframe>
 *
 * Note: NO `allow-same-origin` in the sandbox attribute — combined with
 * separate origin, this prevents the artifact from reading dashboard state
 * or calling fetch() against the main API.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";

export const createSandboxApp = (opts: { artifactsDir: string; appPort: number }) => {
	const { artifactsDir, appPort } = opts;

	const app = new Hono();

	const CSP = [
		"default-src 'none'",
		"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
		"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
		"img-src 'self' data: blob:",
		"font-src 'self' data: https://cdn.jsdelivr.net",
		"connect-src 'none'",
		`frame-ancestors http://127.0.0.1:${appPort}`,
		"form-action 'none'",
		"base-uri 'none'",
	].join("; ");

	app.get("/artifact", async (c) => {
		const id = c.req.query("id");
		if (!id || id.includes("..") || id.startsWith("/")) {
			return c.text("bad id", 400);
		}
		const absPath = join(artifactsDir, id);
		try {
			const s = await stat(absPath);
			if (!s.isFile()) return c.text("not a file", 400);
			c.header("Content-Type", "text/html; charset=utf-8");
			c.header("Content-Security-Policy", CSP);
			c.header("X-Content-Type-Options", "nosniff");
			c.header("Referrer-Policy", "no-referrer");
			const stream = createReadStream(absPath);
			return c.body(Readable.toWeb(stream) as ReadableStream);
		} catch {
			return c.text("not found", 404);
		}
	});

	app.get("/healthz", (c) => c.json({ ok: true, role: "sandbox" }));

	return app;
};
