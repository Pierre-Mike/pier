import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Hono } from "hono";
import { ConfigTest } from "../../platform/config.repo.ts";
import type { AppBindings } from "../../platform/effect-handler.ts";
import { defineRoute } from "../../platform/effect-handler.ts";
import { TerminalSessions } from "../sessions/sessions.repo.ts";
import { projectsDropRoute } from "./projects.drop.routes.ts";
import { makeRepoServiceTest } from "./projects.files.repo.ts";

// ---------------------------------------------------------------------------
// RED trigger: this Layer.succeed adds `writeChars` to the TerminalSessions
// implementation object. Because the `TerminalSessions` interface does not yet
// declare `writeChars`, TypeScript raises an excess-property / missing-method
// error here — that is the intended compile-time RED state.
//
// At runtime (Bun strips types), the runtime RED is:
//  - capturedApp fails to provide writeChars so it is never called
//  - exact-text assertions fail
//  - frontend drop.ts source does not contain the AC-5/6 strings
// ---------------------------------------------------------------------------
const capturedWriteCharsCalls: Array<{ projectId: string; text: string }> = [];

const TerminalSessionsWithWriteChars: Layer.Layer<TerminalSessions> = Layer.succeed(
	TerminalSessions,
	{
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
		// writeChars does not yet exist on the TerminalSessions interface → RED
		writeChars: (args: { projectId: string; text: string }) => {
			capturedWriteCharsCalls.push(args);
			return Effect.succeed({ injected: true });
		},
	},
);

// Dedicated layer providing both RepoService + TerminalSessionsWithWriteChars.
// Option A: build a parallel Hono app wired to the captured layer directly.
// dropHandler will be exported from projects-drop.ts once the spec is implemented.
// Until then, the dynamic import below fails and the capturedApp construction
// is skipped — causing the writeChars assertions to fail (RED).
const testDeps = Layer.provide(makeRepoServiceTest(new Map()), ConfigTest);
const capturedDeps = Layer.merge(testDeps, TerminalSessionsWithWriteChars);

// Dynamic import: RED until dropHandler is exported from projects-drop.ts
type DropHandlerType = Parameters<typeof defineRoute>[0]["handler"];

const { dropHandler: importedDropHandler } = await import("./projects.drop.routes.ts").then(
	(m) => m as { dropHandler?: DropHandlerType },
);

// If dropHandler is not yet exported, capturedApp falls back to a stub app
// that returns 501 — the assertions below will then fail (RED).
const capturedApp = importedDropHandler
	? new Hono<{ Bindings: AppBindings }>().post(
			"/api/projects/:id/drop",
			defineRoute({ deps: capturedDeps, handler: importedDropHandler }),
		)
	: null;

// Layer that stubs writeChars to return injected: false — for the explicit
// injected: false test.
const TerminalSessionsWriteCharsFalse: Layer.Layer<TerminalSessions> = Layer.succeed(
	TerminalSessions,
	{
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
		// writeChars not on interface yet → RED; returns injected: false
		writeChars: (_args: { projectId: string; text: string }) => Effect.succeed({ injected: false }),
	},
);

const falseDeps = Layer.merge(testDeps, TerminalSessionsWriteCharsFalse);
const falseApp = importedDropHandler
	? new Hono<{ Bindings: AppBindings }>().post(
			"/api/projects/:id/drop",
			defineRoute({ deps: falseDeps, handler: importedDropHandler }),
		)
	: null;

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

	test("saved path contains .pier/drops/ not .drops/", async () => {
		const formData = new FormData();
		formData.append("files", new File(["test"], "test.txt"));
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			files: Array<{ name: string; path: string; size: number }>;
			injected: boolean;
		};
		expect(Array.isArray(json.files)).toBe(true);
		expect(json.files.length).toBeGreaterThan(0);
		const file = json.files[0];
		expect(file?.path).toContain(".pier/drops/");
		expect(file?.path).not.toContain("/.drops/");
	});

	test("response shape includes injected boolean field", async () => {
		const formData = new FormData();
		formData.append("files", new File(["hello"], "hello.txt"));
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[]; injected: boolean };
		expect(Array.isArray(json.files)).toBe(true);
		expect(typeof json.injected).toBe("boolean");
	});

	test("writeChars is called with shell-quoted space-joined trailing-space text — single file with space", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until dropHandler is exported from the route module.
		// The null check fails immediately — RED.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		// "my file.txt" contains a space → must be shell-quoted with single quotes
		formData.append("files", new File(["x"], "my file.txt"));
		const res = await capturedApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		// Fails (RED): writeChars not called yet (route doesn't invoke the method)
		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		// Must end with a literal space (not arbitrary whitespace)
		expect((call?.text ?? "").at(-1)).toBe(" ");
		// The file name has a space → must be wrapped in single quotes
		expect(call?.text ?? "").toMatch(/^'[^']+' $/);
	});

	test("writeChars is called with exact text — single safe path (no spaces)", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until dropHandler is exported.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["x"], "safe.txt"));
		const res = await capturedApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		// safe.txt has no spaces → unquoted path + literal trailing space
		const text = call?.text ?? "";
		expect(text).toMatch(/^[A-Za-z0-9_\-./~]+ $/);
		expect(text.at(-1)).toBe(" ");
	});

	test("writeChars is called with exact joined text — two files, second has space", async () => {
		capturedWriteCharsCalls.length = 0;

		// RED: capturedApp is null until dropHandler is exported.
		expect(capturedApp).not.toBeNull();
		if (!capturedApp) return;

		const formData = new FormData();
		formData.append("files", new File(["a"], "a.txt"));
		formData.append("files", new File(["b"], "b with space.txt"));
		const res = await capturedApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		const text = call?.text ?? "";
		// Expected format: <unquoted-pathA> '<quoted-pathB>' <trailing-space>
		// pathA (a.txt) has no special chars → unquoted
		// pathB (b with space.txt) has spaces → single-quoted
		// Single space separator, literal trailing space.
		expect(text).toMatch(/^[A-Za-z0-9_\-./~]+ '[^']+' $/);
		// Literal trailing space
		expect(text.at(-1)).toBe(" ");
		// Two tokens separated by exactly one space (trim trailing, then split)
		const trimmed = text.slice(0, -1); // remove trailing space
		expect(trimmed).toContain(" ");
	});

	test("writeChars returning injected: false — status 200, injected: false in response", async () => {
		// RED: falseApp is null until dropHandler is exported.
		expect(falseApp).not.toBeNull();
		if (!falseApp) return;

		const formData = new FormData();
		formData.append("files", new File(["data"], "data.bin"));
		const res = await falseApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[]; injected: boolean };
		expect(typeof json.injected).toBe("boolean");
		expect(Array.isArray(json.files)).toBe(true);
		// Explicit stub returns injected: false
		expect(json.injected).toBe(false);
	});
});
