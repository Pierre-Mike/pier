import { describe, expect, test } from "bun:test";
import { projectsRoute } from "./projects.ts";

describe("GET /api/projects", () => {
	const { testApp } = projectsRoute;

	test("lists projects", async () => {
		const res = await testApp.request("/api/projects");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { projects: unknown[] };
		expect(json.projects.length).toBe(1);
	});
});

describe("GET /api/projects/:id/files", () => {
	const { testApp } = projectsRoute;

	test("lists repo files", async () => {
		const res = await testApp.request("/api/projects/test-proj/files");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[] };
		expect(json.files.length).toBe(1);
	});

	test("returns empty array for unknown project", async () => {
		const res = await testApp.request("/api/projects/invalid/files");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[] };
		expect(json.files).toEqual([]);
	});
});
