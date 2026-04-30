import { describe, expect, test } from "bun:test";
import { sessionsRoute } from "./sessions.routes.ts";

describe("POST /api/projects/:id/terminal", () => {
	const { testApp } = sessionsRoute;

	test("opens a session", async () => {
		const res = await testApp.request("/api/projects/foo/terminal", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { id: string };
		expect(json.id).toBe("foo");
	});
});

describe("GET /api/sessions", () => {
	const { testApp } = sessionsRoute;

	test("lists sessions", async () => {
		const res = await testApp.request("/api/sessions");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { sessions: unknown[] };
		expect(Array.isArray(json.sessions)).toBe(true);
	});
});

describe("GET /api/sessions/:id", () => {
	const { testApp } = sessionsRoute;

	test("returns 404 for unknown session", async () => {
		const res = await testApp.request("/api/sessions/unknown");
		expect(res.status).toBe(404);
	});
});

describe("DELETE /api/sessions/:id", () => {
	const { testApp } = sessionsRoute;

	test("returns 204", async () => {
		const res = await testApp.request("/api/sessions/foo", { method: "DELETE" });
		expect(res.status).toBe(204);
	});
});

describe("POST /api/sessions/default", () => {
	const { testApp } = sessionsRoute;

	test("opens the default session", async () => {
		const res = await testApp.request("/api/sessions/default", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { id: string; projectId: string; url: string };
		expect(json.id).toBe("default");
		expect(json.url).toBeTruthy();
	});

	test("is idempotent — returns same session on second call", async () => {
		const res1 = await testApp.request("/api/sessions/default", { method: "POST" });
		const json1 = (await res1.json()) as { id: string; url: string };

		const res2 = await testApp.request("/api/sessions/default", { method: "POST" });
		const json2 = (await res2.json()) as { id: string; url: string };

		expect(json1.id).toBe(json2.id);
		expect(json1.url).toBe(json2.url);
	});
});
