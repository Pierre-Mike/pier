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

import { renderProjects, wireSidebarTabs } from "../dashboard/projects.ts";
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

// ---------------------------------------------------------------------------
// spec 059: Repo-grouped project tabs — DOM integration tests
// ---------------------------------------------------------------------------

// AC 1: renderProjects groups rows by parent directory
describe("spec 059 — renderProjects DOM: groups by parent directory", () => {
	beforeEach(() => {
		document.body.innerHTML = `<ul id="projects"></ul>`;
		store.projects = [
			{
				id: "proj-a1",
				name: "Repo A — Project 1",
				path: "/Users/alice/repos/repoA/proj1",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "proj-a2",
				name: "Repo A — Project 2",
				path: "/Users/alice/repos/repoA/proj2",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "proj-b1",
				name: "Repo B — Project 1",
				path: "/Users/alice/repos/repoB/proj1",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set();
	});

	afterEach(() => {
		store.projects = [];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set();
		document.body.innerHTML = "";
	});

	test("renderProjects renders group header elements with class proj-group-header", () => {
		// RED: renderProjects currently renders a flat list — no group headers.
		renderProjects();
		const ul = document.getElementById("projects");
		const headers = ul?.querySelectorAll(".proj-group-header");
		// Expect at least one group header to appear
		expect(headers?.length ?? 0).toBeGreaterThan(0);
	});

	test("renderProjects renders exactly two group headers for two distinct parent dirs", () => {
		// proj-a1 and proj-a2 share parent /Users/alice/repos/repoA
		// proj-b1 has parent /Users/alice/repos/repoB
		// → 2 distinct groups → 2 headers
		renderProjects();
		const ul = document.getElementById("projects");
		const headers = ul?.querySelectorAll(".proj-group-header");
		expect(headers?.length ?? 0).toBe(2);
	});

	test("renderProjects renders both proj-a1 and proj-a2 in the same group (same parent dir)", () => {
		renderProjects();
		const ul = document.getElementById("projects");
		const allLis = ul?.querySelectorAll("li[data-id]");
		// Both proj-a1 and proj-a2 must be present
		const ids = Array.from(allLis ?? []).map((li) => (li as HTMLElement).dataset.id);
		expect(ids).toContain("proj-a1");
		expect(ids).toContain("proj-a2");
	});

	test("renderProjects renders proj-b1 in its own group (different parent dir)", () => {
		renderProjects();
		const ul = document.getElementById("projects");
		const projBLi = ul?.querySelector(`li[data-id="proj-b1"]`);
		expect(projBLi).not.toBeNull();
	});

	test("renderProjects with single parent dir produces exactly one group header", () => {
		// Reset to only projects sharing the same parent dir
		store.projects = [
			{
				id: "same-a",
				name: "Same A",
				path: "/Users/alice/repos/common/a",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "same-b",
				name: "Same B",
				path: "/Users/alice/repos/common/b",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		renderProjects();
		const ul = document.getElementById("projects");
		const headers = ul?.querySelectorAll(".proj-group-header");
		expect(headers?.length ?? 0).toBe(1);
	});
});

// AC 5: filteredProjects filter works within grouped rendering
describe("spec 059 — renderProjects DOM: filter works within grouped output", () => {
	beforeEach(() => {
		document.body.innerHTML = `<ul id="projects"></ul>`;
		store.projects = [
			{
				id: "alpha",
				name: "alpha-service",
				path: "/home/user/mono/alpha",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "beta",
				name: "beta-service",
				path: "/home/user/mono/beta",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "gamma",
				name: "gamma-tool",
				path: "/home/user/tools/gamma",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		store.sessions = new Map();
		store.activeProject = null;
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set();
	});

	afterEach(() => {
		store.projects = [];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set();
		document.body.innerHTML = "";
	});

	test("renderProjects with filter 'alpha' shows only alpha row", () => {
		// RED: grouped rendering must still respect the projectFilter.
		store.projectFilter = "alpha";
		renderProjects();
		const ul = document.getElementById("projects");
		const allLis = ul?.querySelectorAll("li[data-id]");
		const ids = Array.from(allLis ?? []).map((li) => (li as HTMLElement).dataset.id);
		expect(ids).toContain("alpha");
		expect(ids).not.toContain("beta");
		expect(ids).not.toContain("gamma");
	});

	test("renderProjects with filter 'service' shows alpha and beta but not gamma", () => {
		store.projectFilter = "service";
		renderProjects();
		const ul = document.getElementById("projects");
		const allLis = ul?.querySelectorAll("li[data-id]");
		const ids = Array.from(allLis ?? []).map((li) => (li as HTMLElement).dataset.id);
		expect(ids).toContain("alpha");
		expect(ids).toContain("beta");
		expect(ids).not.toContain("gamma");
	});
});

// AC 6: session-alive-dot regression — preserved in grouped rendering
describe("spec 059 — renderProjects DOM: session-alive-dot preserved in grouped rendering", () => {
	beforeEach(() => {
		document.body.innerHTML = `<ul id="projects"></ul>`;
		store.projects = [
			{
				id: "alive-proj",
				name: "Alive",
				path: "/home/user/work/alive",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "dead-proj",
				name: "Dead",
				path: "/home/user/work/dead",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set(["alive-proj"]);
	});

	afterEach(() => {
		store.projects = [];
		store.sessions = new Map();
		store.activeProject = null;
		store.projectFilter = "";
		// biome-ignore lint/suspicious/noExplicitAny: test-only
		(store as any).aliveSessions = new Set();
		document.body.innerHTML = "";
	});

	test("renderProjects still shows session-alive-dot on alive project row in grouped layout", () => {
		// RED: grouped rendering replaces current flat rendering — must preserve dot.
		renderProjects();
		const ul = document.getElementById("projects");
		const aliveLi = ul?.querySelector(`li[data-id="alive-proj"]`);
		expect(aliveLi).not.toBeNull();
		const dot = aliveLi?.querySelector(".session-alive-dot");
		expect(dot).not.toBeNull();
	});

	test("renderProjects does not show session-alive-dot on dead project row in grouped layout", () => {
		renderProjects();
		const ul = document.getElementById("projects");
		const deadLi = ul?.querySelector(`li[data-id="dead-proj"]`);
		const dot = deadLi?.querySelector(".session-alive-dot");
		expect(dot).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// spec 059 AC 2: Sidebar tab switcher — DOM click behavior
// ---------------------------------------------------------------------------

// Helper: build a minimal sidebar DOM with two tab buttons and two tab panels.
// wireSidebarTabs() reads these elements by ID and class.
function buildTabDOM() {
	document.body.innerHTML = `
		<div class="sidebar-tabs">
			<button class="sidebar-tab active" data-tab="projects">Projects</button>
			<button class="sidebar-tab" data-tab="agents">Active Agents</button>
		</div>
		<div id="sidebar-tab-projects">
			<ul id="projects"></ul>
		</div>
		<div id="sidebar-tab-agents" class="hidden">
			<div id="agent-view-inline"></div>
		</div>
	`;
}

describe("spec 059 AC 2 — tab switcher DOM: exactly two tabs exist", () => {
	beforeEach(() => {
		buildTabDOM();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	test("sidebar contains exactly two tab buttons with class sidebar-tab", () => {
		// RED: no tab markup exists yet — wireSidebarTabs builds/reads it.
		// After implementation the DOM (set up by Sidebar.astro) must have exactly 2 tabs.
		// We assert on the buildTabDOM fixture to verify wireSidebarTabs works with it.
		wireSidebarTabs();
		const tabs = document.querySelectorAll(".sidebar-tab");
		expect(tabs.length).toBe(2);
	});

	test("tab buttons are labelled 'Projects' and 'Active Agents'", () => {
		wireSidebarTabs();
		const tabs = Array.from(document.querySelectorAll(".sidebar-tab")).map(
			(t) => (t as HTMLElement).textContent?.trim() ?? "",
		);
		expect(tabs).toContain("Projects");
		// The "Active Agents" label may include a count badge — check for prefix match.
		const hasAgentTab = tabs.some((t) => t.startsWith("Active Agents"));
		expect(hasAgentTab).toBe(true);
	});
});

describe("spec 059 AC 3 — clicking 'Projects' tab shows projects panel, hides agents panel", () => {
	beforeEach(() => {
		buildTabDOM();
		wireSidebarTabs();
		// Start with "Active Agents" active to test clicking back to "Projects"
		const agentsBtn = document.querySelector('[data-tab="agents"]') as HTMLElement | null;
		agentsBtn?.click();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	test("clicking Projects tab removes hidden from projects panel", () => {
		// RED: no tab-switch logic exists yet.
		const projectsBtn = document.querySelector('[data-tab="projects"]') as HTMLElement | null;
		projectsBtn?.click();
		const projectsPanel = document.getElementById("sidebar-tab-projects");
		expect(projectsPanel?.classList.contains("hidden")).toBe(false);
	});

	test("clicking Projects tab adds hidden to agents panel", () => {
		const projectsBtn = document.querySelector('[data-tab="projects"]') as HTMLElement | null;
		projectsBtn?.click();
		const agentsPanel = document.getElementById("sidebar-tab-agents");
		expect(agentsPanel?.classList.contains("hidden")).toBe(true);
	});
});

describe("spec 059 AC 4 — clicking 'Active Agents' tab shows agents panel, hides projects panel", () => {
	beforeEach(() => {
		buildTabDOM();
		wireSidebarTabs();
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	test("clicking Active Agents tab adds hidden to projects panel", () => {
		// RED: no tab-switch logic exists yet.
		const agentsBtn = document.querySelector('[data-tab="agents"]') as HTMLElement | null;
		agentsBtn?.click();
		const projectsPanel = document.getElementById("sidebar-tab-projects");
		expect(projectsPanel?.classList.contains("hidden")).toBe(true);
	});

	test("clicking Active Agents tab removes hidden from agents panel", () => {
		const agentsBtn = document.querySelector('[data-tab="agents"]') as HTMLElement | null;
		agentsBtn?.click();
		const agentsPanel = document.getElementById("sidebar-tab-agents");
		expect(agentsPanel?.classList.contains("hidden")).toBe(false);
	});

	test("clicking Active Agents tab marks that button as active and deactivates Projects button", () => {
		const agentsBtn = document.querySelector('[data-tab="agents"]') as HTMLElement | null;
		agentsBtn?.click();
		expect(agentsBtn?.classList.contains("active")).toBe(true);
		const projectsBtn = document.querySelector('[data-tab="projects"]') as HTMLElement | null;
		expect(projectsBtn?.classList.contains("active")).toBe(false);
	});
});
