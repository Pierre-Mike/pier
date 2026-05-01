import { describe, expect, test } from "bun:test";
import { projectsRoute } from "./projects.routes.ts";

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

describe("GET /api/projects/:id/github-url", () => {
	const { testApp } = projectsRoute;

	test("returns normalized URL for a project with a GitHub origin", async () => {
		const res = await testApp.request("/api/projects/test-proj/github-url");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { url: string | null };
		expect(json.url).toBe("https://github.com/owner/repo");
	});

	test("returns 404 with null when origin is non-GitHub", async () => {
		const res = await testApp.request("/api/projects/non-gh-proj/github-url");
		expect(res.status).toBe(404);
		const json = (await res.json()) as { url: string | null };
		expect(json.url).toBeNull();
	});

	test("returns 404 with null when project has no remote", async () => {
		const res = await testApp.request("/api/projects/missing/github-url");
		expect(res.status).toBe(404);
		const json = (await res.json()) as { url: string | null };
		expect(json.url).toBeNull();
	});
});

describe("GET /api/projects/:id/refs", () => {
	const { testApp } = projectsRoute;

	test("returns branches and worktrees from fixture", async () => {
		const res = await testApp.request("/api/projects/test-proj/refs");
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			branches: Array<{ name: string; current: boolean }>;
			worktrees: Array<{ relPath: string; isMain: boolean }>;
		};
		expect(json.branches.length).toBe(2);
		expect(json.worktrees.length).toBe(1);
		expect(json.worktrees[0]?.isMain).toBe(true);
	});

	test("returns empty refs for unknown project", async () => {
		const res = await testApp.request("/api/projects/invalid/refs");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { branches: unknown[]; worktrees: unknown[] };
		expect(json).toEqual({ branches: [], worktrees: [] });
	});
});
