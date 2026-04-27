import { describe, expect, test } from "bun:test";
import { sessionsRoute } from "./sessions.ts";

describe("POST /api/projects/:id/terminal", () => {
	const { testApp } = sessionsRoute;

	test("opens a session", async () => {
		const res = await testApp.request("/api/projects/foo/terminal", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { id: string };
		expect(json.id).toMatch(/^p[0-9a-f]{12}$/);
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
