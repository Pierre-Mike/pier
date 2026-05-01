import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { sessionsRoute } from "./sessions.routes.ts";

describe("sessionsRoute integration", () => {
	test("implementation uses route-kit pattern structurally", () => {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		const source = readFileSync(resolve(__dirname, "./sessions.routes.ts"), "utf8");

		// Verify route-kit imports are used (not in comments)
		expect(source).toMatch(
			/import\s+{[^}]*route[^}]*}\s+from\s+"\.\.\/\.\.\/platform\/route-kit\.ts"/,
		);
		expect(source).toMatch(
			/import\s+{[^}]*mountPair[^}]*}\s+from\s+"\.\.\/\.\.\/platform\/route-kit\.ts"/,
		);

		// Verify route() is called (semantic usage, not just imported)
		expect(source).toMatch(/route\(\{/);

		// Verify mountPair is called with builder pattern
		expect(source).toMatch(/mountPair\(\s*\(\s*a\s*,\s*h\s*\)\s*=>/);

		// Verify new deps structure exists
		expect(source).toMatch(/const\s+deps\s*=\s*{\s*live:/);
		expect(source).toMatch(/test:\s*TerminalSessionsTest/);

		// Verify defineRoute is NOT used (old pattern)
		expect(source).not.toContain("defineRoute");

		// Verify old parallel chains are gone
		expect(source).not.toMatch(/const\s+makeDeps\s*=/);
		expect(source).not.toMatch(/const\s+testDeps\s*=/);
		expect(source).not.toMatch(/const\s+app\s*=\s*new\s+Hono/);
		expect(source).not.toMatch(/const\s+testApp\s*=\s*new\s+Hono/);
	});

	test("mountPair builds both app and testApp instances", () => {
		expect(sessionsRoute.app).toBeInstanceOf(Hono);
		expect(sessionsRoute.testApp).toBeInstanceOf(Hono);
	});

	test("both halves serve /api/sessions correctly", async () => {
		const resTest = await sessionsRoute.testApp.request("/api/sessions");
		expect(resTest.status).toBe(200);

		const resLive = await sessionsRoute.app.request("/api/sessions");
		expect(resLive.status).toBe(200);
	});
});
