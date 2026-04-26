import { describe, expect, test } from "bun:test";
import { projectsDropRoute } from "./projects-drop.ts";

describe("POST /api/projects/:id/drop", () => {
	const { testApp } = projectsDropRoute;

	test("returns 400 when no files provided", async () => {
		const formData = new FormData();
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("no files");
	});

	test("accepts file upload", async () => {
		const formData = new FormData();
		formData.append("files", new File(["test"], "test.txt"));
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[] };
		expect(Array.isArray(json.files)).toBe(true);
	});
});
