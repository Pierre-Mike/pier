import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Hono } from "hono";
import { ConfigTest } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { routeAdvanced } from "../../platform/route-kit.ts";
import { TerminalSessions } from "../sessions/sessions.repo.ts";

// ---------------------------------------------------------------------------
// RED: drops.routes.ts does not exist yet. The dynamic import below will fail
// at module load time, causing every test in this file to fail.
// ---------------------------------------------------------------------------

// Capture writeChars calls so we can assert on them.
const capturedWriteCharsCalls: Array<{ projectId: string; text: string }> = [];

const TerminalSessionsCapture: Layer.Layer<TerminalSessions> = Layer.succeed(TerminalSessions, {
	open: (projectId: string) =>
		Effect.succeed({
			id: projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60),
			projectId,
			url: `mem://${projectId}`,
			createdAt: Date.now(),
			status: "live" as const,
		}),
	openDefault: () =>
		Effect.succeed({
			id: "default",
			projectId: "",
			url: "mem://default",
			createdAt: Date.now(),
			status: "live" as const,
		}),
	close: () => Effect.void,
	list: () => Effect.succeed([]),
	get: () => Effect.succeed(null),
	health: () => Effect.succeed(false),
	writeChars: (args: { projectId: string; text: string }) => {
		capturedWriteCharsCalls.push(args);
		return Effect.succeed({ injected: true });
	},
});

const TerminalSessionsInjectFalse: Layer.Layer<TerminalSessions> = Layer.succeed(TerminalSessions, {
	open: (projectId: string) =>
		Effect.succeed({
			id: projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60),
			projectId,
			url: `mem://${projectId}`,
			createdAt: Date.now(),
			status: "live" as const,
		}),
	openDefault: () =>
		Effect.succeed({
			id: "default",
			projectId: "",
			url: "mem://default",
			createdAt: Date.now(),
			status: "live" as const,
		}),
	close: () => Effect.void,
	list: () => Effect.succeed([]),
	get: () => Effect.succeed(null),
	health: () => Effect.succeed(false),
	writeChars: (_args: { projectId: string; text: string }) => Effect.succeed({ injected: false }),
});

// ---------------------------------------------------------------------------
// Dynamic import — RED until drops.routes.ts is implemented.
// The imported module must export: dropsPostHandler, dropsGetHandler, dropsRoute.
// ---------------------------------------------------------------------------
type DropsModule = {
	dropsPostHandler?: (
		c: import("hono").Context<{ Bindings: AppBindings }>,
	) => Effect.Effect<Response, never, import("../sessions/sessions.repo.ts").TerminalSessions>;
	dropsGetHandler?: (
		c: import("hono").Context<{ Bindings: AppBindings }>,
	) => Effect.Effect<Response, never, never>;
	dropsRoute?: { app: Hono<{ Bindings: AppBindings }>; testApp: Hono<{ Bindings: AppBindings }> };
};

const dropsModule: DropsModule = await import("./drops.routes.ts").catch(() => ({}));

// Build a captured app wired to TerminalSessionsCapture — used for writeChars assertions.
const capturedApp = dropsModule.dropsPostHandler
	? (() => {
			const r = routeAdvanced({
				liveDeps: TerminalSessionsCapture,
				testDeps: TerminalSessionsCapture,
				handler: dropsModule.dropsPostHandler as (
					c: import("hono").Context<{ Bindings: AppBindings }>,
				) => Effect.Effect<
					Response,
					never,
					import("../sessions/sessions.repo.ts").TerminalSessions
				>,
			});
			return new Hono<{ Bindings: AppBindings }>().post("/api/drops", r.live);
		})()
	: null;

// Build a false-inject app — writeChars returns injected: false.
const falseApp = dropsModule.dropsPostHandler
	? (() => {
			const r = routeAdvanced({
				liveDeps: TerminalSessionsInjectFalse,
				testDeps: TerminalSessionsInjectFalse,
				handler: dropsModule.dropsPostHandler as (
					c: import("hono").Context<{ Bindings: AppBindings }>,
				) => Effect.Effect<
					Response,
					never,
					import("../sessions/sessions.repo.ts").TerminalSessions
				>,
			});
			return new Hono<{ Bindings: AppBindings }>().post("/api/drops", r.live);
		})()
	: null;

// Build a GET app for listing — wired with ConfigTest.
const getApp = dropsModule.dropsGetHandler
	? (() => {
			const r = routeAdvanced({
				liveDeps: ConfigTest,
				testDeps: ConfigTest,
				handler: dropsModule.dropsGetHandler as (
					c: import("hono").Context<{ Bindings: AppBindings }>,
				) => Effect.Effect<Response, never, never>,
			});
			return new Hono<{ Bindings: AppBindings }>().get("/api/drops", r.live);
		})()
	: null;

// ---------------------------------------------------------------------------
// POST /api/drops
// ---------------------------------------------------------------------------

describe("POST /api/drops", () => {
	test("returns 400 when activeProjectId is missing", async () => {
		// RED: capturedApp is null until drops.routes.ts is implemented.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["data"], "file.txt"));
		// No activeProjectId field — must return 400
		const res = await capturedApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("no active project");
	});

	test("returns 200 with saved path under <appRoot>/drops/ and injected boolean", async () => {
		// RED: capturedApp is null until drops.routes.ts is implemented.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["hello"], "hello.txt"));
		formData.append("activeProjectId", "my-project");
		const res = await capturedApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			files: Array<{ name: string; path: string; size: number; injected: boolean }>;
		};
		expect(Array.isArray(json.files)).toBe(true);
		expect(json.files.length).toBeGreaterThan(0);
		const file = json.files[0];
		expect(file).toBeDefined();
		// Path must be absolute and under a "drops" folder — not a per-project path
		expect(file?.path).toMatch(/\/drops\//);
		expect(file?.path).not.toContain(".pier/drops");
		expect(typeof file?.injected).toBe("boolean");
	});

	test("calls writeChars with shell-quoted path and trailing space — file name with spaces", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until drops.routes.ts is implemented.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["x"], "my file.txt"));
		formData.append("activeProjectId", "my-project");
		const res = await capturedApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		// writeChars must have been called exactly once
		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		// Must end with a literal trailing space
		expect((call?.text ?? "").at(-1)).toBe(" ");
		// File name has a space → must be single-quoted
		expect(call?.text ?? "").toMatch(/^'[^']+' $/);
	});

	test("calls writeChars with unquoted path and trailing space — safe file name", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until drops.routes.ts is implemented.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["x"], "safe.txt"));
		formData.append("activeProjectId", "my-project");
		const res = await capturedApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		const text = call?.text ?? "";
		// No special chars → unquoted path + trailing space
		expect(text).toMatch(/^[A-Za-z0-9_\-./~]+ $/);
		expect(text.at(-1)).toBe(" ");
	});

	test("calls writeChars once with both paths joined — two files, second has spaces", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until drops.routes.ts is implemented.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["a"], "a.txt"));
		formData.append("files", new File(["b"], "b with space.txt"));
		formData.append("activeProjectId", "my-project");
		const res = await capturedApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		// Single writeChars call covering all files
		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		const text = call?.text ?? "";
		// Trailing space
		expect(text.at(-1)).toBe(" ");
		// Two tokens: unquoted pathA + space + quoted pathB + trailing space
		expect(text).toMatch(/^[A-Za-z0-9_\-./~]+ '[^']+' $/);
		// Remove trailing space, split → exactly 2 tokens
		const trimmed = text.slice(0, -1);
		const spaceIdx = trimmed.indexOf(" ");
		expect(spaceIdx).toBeGreaterThan(0);
	});

	test("returns 200 with injected: false when writeChars returns injected: false", async () => {
		// RED: falseApp is null until drops.routes.ts is implemented.
		expect(falseApp).not.toBeNull();
		if (!falseApp) return;

		const formData = new FormData();
		formData.append("files", new File(["data"], "data.bin"));
		formData.append("activeProjectId", "my-project");
		const res = await falseApp.request("/api/drops", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			files: Array<{ name: string; path: string; size: number; injected: boolean }>;
		};
		expect(Array.isArray(json.files)).toBe(true);
		// At least the file entry; injected on each entry reflects the writeChars result
		const file = json.files[0];
		expect(file?.injected).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// GET /api/drops
// ---------------------------------------------------------------------------

describe("GET /api/drops", () => {
	test("returns an array sorted newest-first with name, path, size, mtime", async () => {
		// RED: getApp is null until drops.routes.ts is implemented.
		expect(getApp).not.toBeNull();
		if (!getApp) return;

		const res = await getApp.request("/api/drops", { method: "GET" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as Array<{
			name: string;
			path: string;
			size: number;
			mtime: number;
		}>;
		expect(Array.isArray(json)).toBe(true);
		// If more than one entry, they must be sorted newest-first (descending mtime)
		for (let i = 1; i < json.length; i++) {
			const prev = json[i - 1];
			const curr = json[i];
			expect((prev?.mtime ?? 0) >= (curr?.mtime ?? 0)).toBe(true);
		}
		// Each entry must have required fields
		for (const entry of json) {
			expect(typeof entry.name).toBe("string");
			expect(typeof entry.path).toBe("string");
			expect(typeof entry.size).toBe("number");
			expect(typeof entry.mtime).toBe("number");
		}
	});

	test("path in each entry contains /drops/ and is absolute", async () => {
		// RED: getApp is null until drops.routes.ts is implemented.
		expect(getApp).not.toBeNull();
		if (!getApp) return;

		const res = await getApp.request("/api/drops", { method: "GET" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as Array<{
			name: string;
			path: string;
			size: number;
			mtime: number;
		}>;
		for (const entry of json) {
			// Path must be absolute (starts with /)
			expect(entry.path.startsWith("/")).toBe(true);
			// Path must be under the drops folder
			expect(entry.path).toContain("/drops/");
		}
	});
});
