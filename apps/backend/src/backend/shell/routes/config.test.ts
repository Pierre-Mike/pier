import { describe, expect, test } from "bun:test";
import { configRoute } from "./config.ts";

describe("GET /api/config", () => {
	const { testApp } = configRoute;

	test("returns config JSON", async () => {
		const res = await testApp.request("/api/config");
		expect(res.status).toBe(200);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json["appPort"]).toBe(5173);
		expect(json["sandboxPort"]).toBe(5174);
		expect(json["projectsRoot"]).toBe("/tmp/test-projects");
		expect(json["artifactsDir"]).toBe("/tmp/test-pi/artifacts");
	});
});
