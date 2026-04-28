import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { TerminalSessions } from "../../infra/terminal-sessions.ts";
import { projectsDropRoute } from "./projects-drop.ts";

// ---------------------------------------------------------------------------
// RED trigger: this Layer.succeed adds `writeChars` to the TerminalSessions
// implementation object. Because the `TerminalSessions` interface does not yet
// declare `writeChars`, TypeScript raises an excess-property / missing-method
// error here — that is the intended RED state.
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

	test("writeChars is called with shell-quoted space-joined trailing-space text", async () => {
		capturedWriteCharsCalls.length = 0;

		// The layer reference above ensures compile-time RED.
		// At runtime, the base testApp does not wire TerminalSessions, so
		// writeChars is never called — both assertions below fail until
		// implementation routes to writeChars.
		expect(TerminalSessionsWithWriteChars).toBeDefined();

		const formData = new FormData();
		formData.append("files", new File(["x"], "my file.txt"));
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);

		// Fails (RED): writeChars not called yet
		expect(capturedWriteCharsCalls.length).toBe(1);
		const call = capturedWriteCharsCalls[0];
		// Trailing space required
		expect(call?.text).toMatch(/\s$/);
		// File name contains a space → must be single-quoted
		expect(call?.text).toMatch(/'[^']*'/);
	});

	test("injected: false in default test layer — status 200, files present", async () => {
		const formData = new FormData();
		formData.append("files", new File(["data"], "data.bin"));
		const res = await testApp.request("/api/projects/foo/drop", {
			method: "POST",
			body: formData,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { files: unknown[]; injected: boolean };
		expect(typeof json.injected).toBe("boolean");
		expect(Array.isArray(json.files)).toBe(true);
		// Base test layer has no terminal → injected must be false
		expect(json.injected).toBe(false);
	});
});
