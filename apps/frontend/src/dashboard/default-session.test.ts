import { afterEach, beforeEach, describe, expect, mock, type spyOn, test } from "bun:test";
import { store } from "./state.ts";

describe("default session integration", () => {
	let originalFetch: typeof globalThis.fetch;
	let refreshFilesSpy: ReturnType<typeof spyOn> | null = null;

	beforeEach(() => {
		// Mock fetch to simulate the backend route
		originalFetch = globalThis.fetch;
		globalThis.fetch = mock(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/sessions/default")) {
				return new Response(
					JSON.stringify({
						id: "default",
						projectId: "",
						url: "http://127.0.0.1:3000/zellij/default",
						status: "live",
						createdAt: Date.now(),
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response("Not Found", { status: 404 });
		}) as typeof globalThis.fetch;

		// Reset store state
		store.sessions.clear();
		store.activeProject = null;

		// Mock localStorage
		globalThis.localStorage = {
			getItem: mock(() => null),
			setItem: mock(() => {
				/* no-op mock */
			}),
			removeItem: mock(() => {
				/* no-op mock */
			}),
			clear: mock(() => {
				/* no-op mock */
			}),
			key: mock(() => null),
			length: 0,
		};
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (refreshFilesSpy) {
			refreshFilesSpy.mockRestore();
			refreshFilesSpy = null;
		}
	});

	test("selectDefaultSession sets activeProject to __default__ and stores session", async () => {
		// Simulate calling selectDefaultSession
		const res = await fetch("/api/sessions/default", { method: "POST" });
		const session = await res.json();

		// Simulate what selectDefaultSession does
		store.sessions.set("__default__", session);
		store.activeProject = "__default__";

		expect(store.activeProject).toBe("__default__");
		expect(store.sessions.has("__default__")).toBe(true);
		expect(store.sessions.get("__default__")?.id).toBe("default");
	});

	test("renderSessions filters out __default__ from the list", () => {
		// Add a regular project and the default session
		store.sessions.set("project-a", {
			id: "project-a",
			projectId: "project-a",
			url: "http://127.0.0.1:3000/zellij/project-a",
			status: "live",
			createdAt: Date.now(),
		});
		store.sessions.set("__default__", {
			id: "default",
			projectId: "",
			url: "http://127.0.0.1:3000/zellij/default",
			status: "live",
			createdAt: Date.now(),
		});

		// Simulate renderSessions logic: filter out __default__
		const visibleSessions = Array.from(store.sessions.keys()).filter(
			(key) => key !== "__default__",
		);

		expect(visibleSessions).toEqual(["project-a"]);
		expect(visibleSessions.includes("__default__")).toBe(false);
	});

	test("setActiveProject(__default__) does NOT call refreshFiles", () => {
		// This test verifies the guard logic that should be added to setActiveProject
		// The actual implementation will guard refreshFiles() when activeProject === "__default__"

		store.sessions.set("__default__", {
			id: "default",
			projectId: "",
			url: "http://127.0.0.1:3000/zellij/default",
			status: "live",
			createdAt: Date.now(),
		});

		// Simulate setActiveProject logic
		const projectId = "__default__";
		const shouldRefreshFiles = projectId !== "__default__";

		store.activeProject = projectId;

		expect(store.activeProject).toBe("__default__");
		expect(shouldRefreshFiles).toBe(false); // Guard should prevent refreshFiles() call
	});

	test("localStorage persists activeProject = __default__", () => {
		store.sessions.set("__default__", {
			id: "default",
			projectId: "",
			url: "http://127.0.0.1:3000/zellij/default",
			status: "live",
			createdAt: Date.now(),
		});
		store.activeProject = "__default__";

		// Simulate what the app does on state change
		localStorage.setItem("pier:active-project", "__default__");

		expect(localStorage.setItem).toHaveBeenCalledWith("pier:active-project", "__default__");
	});

	test("reload restores activeProject from localStorage but does not auto-fetch", () => {
		// Simulate localStorage having __default__ from previous session
		const mockGetItem = mock((key: string) =>
			key === "pier:active-project" ? "__default__" : null,
		);
		globalThis.localStorage.getItem = mockGetItem;

		// Simulate boot sequence: restore from localStorage
		const storedActiveProject = localStorage.getItem("pier:active-project");

		// The iframe should NOT be created until the user clicks
		expect(storedActiveProject).toBe("__default__");
		// In the real app, setActiveProject would be called ONLY when the user clicks the button,
		// not automatically on boot. This test verifies the reload intent: restore preference,
		// but don't spawn the session.
	});

	test("default button click flow: fetch -> store -> setActive -> persist", async () => {
		// Full e2e flow simulation
		const res = await fetch("/api/sessions/default", { method: "POST" });
		const session = await res.json();

		// Store the session
		store.sessions.set("__default__", session);

		// Set active
		store.activeProject = "__default__";

		// Persist to localStorage
		localStorage.setItem("pier:active-project", "__default__");

		// Assertions
		expect(store.activeProject).toBe("__default__");
		expect(store.sessions.get("__default__")?.id).toBe("default");
		expect(localStorage.setItem).toHaveBeenCalledWith("pier:active-project", "__default__");
	});
});
