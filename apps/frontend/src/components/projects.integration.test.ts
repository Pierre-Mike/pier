/**
 * spec 036: Show session-alive dot on closed project rows
 *
 * Integration gate — DOM behavior tests for renderProjects with happy-dom.
 * Verifies that renderProjects renders .session-alive-dot on closed project
 * rows when store.aliveSessions contains the project ID.
 *
 * RED: these tests fail until the implementer:
 *   1. Adds aliveSessions: Set<string> to DashboardState
 *   2. Initialises it in state.ts
 *   3. Updates renderProjects to read store.aliveSessions and render the dot
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";

// ---------------------------------------------------------------------------
// DOM environment setup — mirrors dashboard/projects.integration.test.ts
// ---------------------------------------------------------------------------
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

import { renderProjects } from "../dashboard/projects.ts";
import { store } from "../dashboard/state.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJ_ALIVE = "proj-alive";
const PROJ_DEAD = "proj-dead";

function populateStore() {
	store.projects = [
		{
			id: PROJ_ALIVE,
			name: "Alive Project",
			path: "/alive",
			isGitRepo: true,
			lastModified: 0,
		},
		{
			id: PROJ_DEAD,
			name: "Dead Project",
			path: "/dead",
			isGitRepo: true,
			lastModified: 0,
		},
	];
	store.sessions = new Map(); // both projects are in the closed list (no open sessions)
	store.activeProject = null;
	store.projectFilter = "";
	// RED: aliveSessions does not exist on store yet — this line will fail until
	// the implementer adds the field to DashboardState and state.ts.
	// biome-ignore lint/suspicious/noExplicitAny: test-only — aliveSessions not yet in DashboardState
	(store as any).aliveSessions = new Set([PROJ_ALIVE]);
}

function clearStore() {
	store.projects = [];
	store.sessions = new Map();
	store.activeProject = null;
	store.projectFilter = "";
	// biome-ignore lint/suspicious/noExplicitAny: test-only — aliveSessions not yet in DashboardState
	(store as any).aliveSessions = new Set();
}

// ---------------------------------------------------------------------------
// spec 036 AC 1: alive project row shows session-alive-dot
// ---------------------------------------------------------------------------

describe("spec 037 — renderProjects DOM: session-alive-dot on alive closed rows", () => {
	beforeEach(() => {
		document.body.innerHTML = `<ul id="projects"></ul>`;
		populateStore();
	});

	afterEach(() => {
		clearStore();
		document.body.innerHTML = "";
	});

	// AC 1: When a project is in aliveSessions, its closed row must show a dot.
	test("renderProjects renders .session-alive-dot on a project row when aliveSessions contains its ID", () => {
		// RED: renderProjects does not check aliveSessions — no dot will appear.
		renderProjects();
		const ul = document.getElementById("projects");
		expect(ul).not.toBeNull();

		// Find the li for the alive project
		const aliveLi = ul?.querySelector(`li[data-id="${PROJ_ALIVE}"]`);
		expect(aliveLi).not.toBeNull();

		// The dot must be present inside the alive project's row
		const dot = aliveLi?.querySelector(".session-alive-dot");
		expect(dot).not.toBeNull();
	});

	// AC 2: When a project is NOT in aliveSessions, its row must NOT show a dot.
	test("renderProjects does NOT render .session-alive-dot on a project row when aliveSessions does not contain its ID", () => {
		renderProjects();
		const ul = document.getElementById("projects");

		const deadLi = ul?.querySelector(`li[data-id="${PROJ_DEAD}"]`);
		expect(deadLi).not.toBeNull();

		const dot = deadLi?.querySelector(".session-alive-dot");
		// No dot for a project not in aliveSessions
		expect(dot).toBeNull();
	});

	// AC 1 + AC 2 combined: only the alive project gets a dot
	test("only the alive project row has the dot — dead project row has none", () => {
		// RED: no dots will appear at all until renderProjects is updated.
		renderProjects();
		const ul = document.getElementById("projects");

		const allDots = ul?.querySelectorAll(".session-alive-dot");
		// Exactly one dot: for PROJ_ALIVE only.
		expect(allDots?.length).toBe(1);

		// And it must be inside the alive project's li, not the dead one.
		const deadLi = ul?.querySelector(`li[data-id="${PROJ_DEAD}"]`);
		const deadDot = deadLi?.querySelector(".session-alive-dot");
		expect(deadDot).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC 2: No dot when aliveSessions is empty
// ---------------------------------------------------------------------------

describe("spec 037 — renderProjects DOM: no dot when aliveSessions is empty", () => {
	beforeEach(() => {
		document.body.innerHTML = `<ul id="projects"></ul>`;
		store.projects = [
			{
				id: "proj-no-alive",
				name: "No Alive Project",
				path: "/nope",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set(); // empty — no alive sessions
	});

	afterEach(() => {
		clearStore();
		document.body.innerHTML = "";
	});

	test("renderProjects renders no .session-alive-dot elements when aliveSessions is empty", () => {
		renderProjects();
		const ul = document.getElementById("projects");
		const dots = ul?.querySelectorAll(".session-alive-dot");
		expect(dots?.length ?? 0).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Isolation: session-alive-dot from renderProjects must not bleed outside #projects
// ---------------------------------------------------------------------------

describe("spec 037 — session-alive-dot isolation", () => {
	beforeEach(() => {
		document.body.innerHTML = `
			<ul id="projects"></ul>
			<section id="sessions-section" class="hidden"><ul id="sessions"></ul></section>
		`;
		populateStore();
	});

	afterEach(() => {
		clearStore();
		document.body.innerHTML = "";
	});

	test("session-alive-dot from renderProjects appears only inside #projects, not #sessions", () => {
		renderProjects();

		const sessionsDots = document
			.getElementById("sessions")
			?.querySelectorAll(".session-alive-dot");
		expect(sessionsDots?.length ?? 0).toBe(0);
	});
});
