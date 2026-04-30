import { describe, expect, test } from "bun:test";
import { artifactsRoute } from "./artifacts.routes.ts";

describe("GET /api/artifacts", () => {
	const { testApp } = artifactsRoute;

	test("lists artifacts", async () => {
		const res = await testApp.request("/api/artifacts");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { artifacts: unknown[] };
		expect(Array.isArray(json.artifacts)).toBe(true);
	});

	test("accepts project filter", async () => {
		const res = await testApp.request("/api/artifacts?project=foo");
		expect(res.status).toBe(200);
	});

	test("accepts limit parameter", async () => {
		const res = await testApp.request("/api/artifacts?limit=10");
		expect(res.status).toBe(200);
	});
});
