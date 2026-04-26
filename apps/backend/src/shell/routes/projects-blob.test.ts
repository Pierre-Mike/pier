import { describe, expect, test } from "bun:test";
import { projectsBlobRoute } from "./projects-blob.ts";

describe("GET /api/projects/:id/blob", () => {
	const { testApp } = projectsBlobRoute;

	test("returns 400 when path missing", async () => {
		const res = await testApp.request("/api/projects/foo/blob");
		expect(res.status).toBe(400);
	});

	test("serves blob when found", async () => {
		const res = await testApp.request("/api/projects/foo/blob?path=bar.txt");
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toBe("test content");
	});

	test("returns 404 when blob not found", async () => {
		const res = await testApp.request("/api/projects/foo/blob?path=notfound.txt");
		expect(res.status).toBe(404);
	});
});
