import { describe, expect, test } from "bun:test";
import { artifactsBlobRoute } from "./artifacts.blob.routes.ts";

describe("GET /api/artifacts/blob", () => {
	const { testApp } = artifactsBlobRoute;

	test("returns 400 for missing id", async () => {
		const res = await testApp.request("/api/artifacts/blob");
		expect(res.status).toBe(400);
	});

	test("returns 400 for path traversal attempt", async () => {
		const res = await testApp.request("/api/artifacts/blob?id=../etc/passwd");
		expect(res.status).toBe(400);
	});

	test("serves artifact blob", async () => {
		const res = await testApp.request("/api/artifacts/blob?id=test.html");
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toBe("<p>test</p>");
	});

	test("returns 404 for unknown artifact", async () => {
		const res = await testApp.request("/api/artifacts/blob?id=notfound.html");
		expect(res.status).toBe(404);
	});
});
