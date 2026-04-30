import { expect, test } from "bun:test";
import { Hono } from "hono";
import { localhostGuard, setSecurityHeaders } from "./security.ts";

test("localhostGuard allows 127.0.0.1", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://127.0.0.1:8080/test", {
		headers: { Host: "127.0.0.1:8080" },
	});
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("ok");
});

test("localhostGuard allows localhost", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://localhost:8080/test", {
		headers: { Host: "localhost:8080" },
	});
	expect(res.status).toBe(200);
});

test("localhostGuard allows ::1", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://[::1]:8080/test", {
		headers: { Host: "[::1]:8080" },
	});
	expect(res.status).toBe(200);
});

test("localhostGuard rejects non-loopback host", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://example.com/test", {
		headers: { Host: "example.com" },
	});
	expect(res.status).toBe(403);
	expect(await res.text()).toBe("Host 'example.com' not allowed");
});

test("localhostGuard strips port from Host header", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://127.0.0.1:5273/test", {
		headers: { Host: "127.0.0.1:5273" },
	});
	expect(res.status).toBe(200);
});

test("localhostGuard rejects sec-fetch-site cross-origin", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://127.0.0.1/test", {
		headers: {
			Host: "127.0.0.1",
			"sec-fetch-site": "cross-origin",
		},
	});
	expect(res.status).toBe(403);
	expect(await res.text()).toBe("sec-fetch-site 'cross-origin' rejected");
});

test("localhostGuard allows sec-fetch-site same-origin", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://127.0.0.1/test", {
		headers: {
			Host: "127.0.0.1",
			"sec-fetch-site": "same-origin",
		},
	});
	expect(res.status).toBe(200);
});

test("localhostGuard allows sec-fetch-site none", async () => {
	const app = new Hono();
	app.use(localhostGuard);
	app.get("/test", (c) => c.text("ok"));
	const res = await app.request("http://127.0.0.1/test", {
		headers: {
			Host: "127.0.0.1",
			"sec-fetch-site": "none",
		},
	});
	expect(res.status).toBe(200);
});

test("setSecurityHeaders sets all expected headers", async () => {
	const app = new Hono();
	app.get("/test", (c) => {
		setSecurityHeaders(c);
		return c.text("ok");
	});
	const res = await app.request("/test");
	expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
	expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
	expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
});
