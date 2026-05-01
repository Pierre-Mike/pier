import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { sessionsRoute } from "./sessions.routes.ts";

describe("sessionsRoute integration", () => {
	test("implementation uses route-kit pattern", () => {
		const source = readFileSync("apps/backend/src/features/sessions/sessions.routes.ts", "utf8");
		expect(source).toContain("mountPair");
		expect(source).toContain('from "../../platform/route-kit.ts"');
		expect(source).not.toContain("defineRoute");
	});

	test("mountPair builds both app and testApp instances", () => {
		expect(sessionsRoute.app).toBeInstanceOf(Hono);
		expect(sessionsRoute.testApp).toBeInstanceOf(Hono);
	});

	test("app serves /api/sessions with live deps", async () => {
		const res = await sessionsRoute.testApp.request("/api/sessions");
		expect(res.status).toBe(200);
	});
});
