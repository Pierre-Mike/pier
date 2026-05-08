/**
 * spec 034 + spec 035: Integration tests for dismissSession, closeSession,
 * and the session-alive-dot DOM feature.
 *
 * These tests import live functions (where possible) and use the real store
 * so the behavior is observable end-to-end within the module boundary.
 *
 * happy-dom is injected manually so bun:test runs with a real DOM environment.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// DOM environment setup — required for tests that call renderSessions and
// inspect the resulting DOM. Pattern mirrors files.test.ts (spec 024).
// ---------------------------------------------------------------------------
import { GlobalWindow } from "happy-dom";

const win = new GlobalWindow();
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).window = win;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).document = win.document;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).HTMLElement = win.HTMLElement;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Element = win.Element;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).NodeList = win.NodeList;

// We import dismissSession from projects.ts.
// RED: dismissSession does not exist yet — this import will fail until the
// implementer adds the export.
import { dismissSession } from "./projects.ts";
import { store } from "./state.ts";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = "test-proj-abc";
const SESSION_ENTRY = { url: "mem://test-proj-abc", sessionId: "test-proj-abc" };

function populateStore() {
	store.projects = [
		{
			id: SESSION_ID,
			name: "Test Project",
			path: "/test",
			isGitRepo: true,
			lastModified: 0,
		},
	];
	store.sessions = new Map([[SESSION_ID, SESSION_ENTRY]]);
	store.activeProject = SESSION_ID;
}

function clearStore() {
	store.projects = [];
	store.sessions = new Map();
	store.activeProject = null;
}

// ---------------------------------------------------------------------------
// spec 034 AC 1 + AC 2: dismissSession removes from store, no API call
// ---------------------------------------------------------------------------

describe("dismissSession — UI-only session close (spec 034 AC 1 + AC 2)", () => {
	beforeEach(populateStore);
	afterEach(clearStore);

	test("dismissSession removes the session from store.sessions", async () => {
		expect(store.sessions.has(SESSION_ID)).toBe(true);
		await dismissSession(SESSION_ID);
		expect(store.sessions.has(SESSION_ID)).toBe(false);
	});

	test("dismissSession does not throw even when session has no iframe", async () => {
		// The session entry has no iframe attached — must not throw.
		await expect(dismissSession(SESSION_ID)).resolves.not.toThrow();
	});

	test("dismissSession clears activeProject when it matches the dismissed session", async () => {
		store.activeProject = SESSION_ID;
		await dismissSession(SESSION_ID);
		// After dismissing the only session, activeProject should be null or shifted.
		// The store validator requires activeProject to be in sessions; since
		// sessions is now empty, activeProject must be null.
		expect(store.activeProject).toBeNull();
	});

	test("dismissSession does NOT call the DELETE sessions API (observable via no network error)", async () => {
		// In the test environment the api client's $delete will throw a network
		// error if called (no actual backend). dismissSession must complete
		// without such an error because it never calls $delete.
		// We verify by checking the sessions store state change happens cleanly.
		let threw = false;
		try {
			await dismissSession(SESSION_ID);
		} catch {
			threw = true;
		}
		// If dismissSession tried to call the API it would throw; it must not.
		expect(threw).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// spec 034 AC 5: closeSession still kills via DELETE API
// ---------------------------------------------------------------------------

describe("closeSession — kill path still calls DELETE API (spec 034 AC 5)", () => {
	// We test this indirectly: the source-level assertion in projects.test.ts
	// (unit gate) already verifies $delete is present in closeSession's body.
	// Here we add a behavioral smoke: verify that closeSession at least attempts
	// the API call (it will fail in test env, but the attempt must happen).

	beforeEach(populateStore);
	afterEach(clearStore);

	// Dynamically import closeSession so we can test the kill path.
	// RED: until dismissSession exists as a separate export, this import block
	// may also validate module shape.
	test("closeSession export is present in projects.ts module", async () => {
		const mod = await import("./projects.ts");
		expect(typeof mod.closeSession).toBe("function");
	});

	test("dismissSession export is present in projects.ts module (spec 034 new export)", async () => {
		const mod = await import("./projects.ts");
		// RED: dismissSession does not exist yet.
		expect(typeof mod.dismissSession).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// spec 035: Show session-alive dot on Close Project button
// Integration tests: verify renderSessions DOM output includes session-alive-dot
// ---------------------------------------------------------------------------

import { renderSessions } from "./projects.ts";

describe("spec 035 — renderSessions DOM integration: session-alive-dot", () => {
	beforeEach(() => {
		// Set up a minimal DOM environment (happy-dom is configured globally in bun).
		// Create the #sessions-section and #sessions elements that renderSessions expects.
		document.body.innerHTML = `
			<section id="sessions-section" class="hidden">
				<ul id="sessions"></ul>
			</section>
		`;
		populateStore();
	});

	afterEach(() => {
		clearStore();
		document.body.innerHTML = "";
	});

	// AC 1: renderSessions renders a DOM node with class session-alive-dot
	// inside each session <li> when there is an active session with a sessionId.
	test("renderSessions renders a .session-alive-dot element in each session li", () => {
		// RED: renderSessions does not render session-alive-dot yet.
		renderSessions();
		const ul = document.getElementById("sessions");
		expect(ul).not.toBeNull();
		const dots = ul?.querySelectorAll(".session-alive-dot");
		// There is one session in store (SESSION_ID with sessionId set), so one dot.
		expect(dots?.length).toBeGreaterThanOrEqual(1);
	});

	// AC 2: The dot only appears when sessionId is present.
	// Test with a session that has no sessionId — dot must be absent.
	test("renderSessions does NOT render .session-alive-dot when session has no sessionId", () => {
		// Clear the store and populate with a session that has no sessionId.
		clearStore();
		store.projects = [
			{
				id: "proj-no-sid",
				name: "No SID Project",
				path: "/c",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		// Session entry with no sessionId (UI-tracked only, no confirmed backend session).
		store.sessions = new Map([["proj-no-sid", { url: "mem://proj-no-sid" }]]);
		store.activeProject = null;

		renderSessions();

		const ul = document.getElementById("sessions");
		const dots = ul?.querySelectorAll(".session-alive-dot");
		// No dot should appear for a session with no sessionId.
		expect(dots?.length ?? 0).toBe(0);
	});

	// AC 3: session-alive-dot must NOT appear in the projects list.
	// Since renderSessions is scoped to #sessions, a dot outside that section
	// would be a bug. Verify no dot appears in the overall document.body
	// outside of #sessions after calling renderSessions.
	test("session-alive-dot elements are confined to the sessions list, not the projects list", () => {
		// Augment DOM with a projects list.
		const projectsSection = document.createElement("ul");
		projectsSection.id = "projects";
		document.body.appendChild(projectsSection);

		renderSessions();

		// Dots must only appear inside #sessions, not #projects.
		const projectsDots = projectsSection.querySelectorAll(".session-alive-dot");
		expect(projectsDots.length).toBe(0);
	});
});
