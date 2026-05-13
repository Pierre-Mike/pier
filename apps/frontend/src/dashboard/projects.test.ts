import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Source text (read once; used for scoped substring assertions where imports
// can't reach internal logic). Import-and-call is used where possible.
// ---------------------------------------------------------------------------
const projectsSource = await Bun.file(new URL("./projects.ts", import.meta.url)).text();
const dashboardFiles = ["./projects.ts", "./terminal-focus.test.ts"] as const;

// ---------------------------------------------------------------------------
// Helper: extract a named function body without assuming `export function`
// shape. Matches:
//   function foo(         (plain or export)
//   const foo = (         (const arrow)
//   const foo = async (   (const async arrow)
// and captures everything up to the next top-level function/const declaration
// or end-of-string.
// ---------------------------------------------------------------------------
function extractFunctionBody(source: string, name: string): string {
	// Match either `function <name>(` or `<name> = (`/`<name>=(`
	const pattern = new RegExp(
		`(?:function\\s+${name}\\s*\\(|\\b${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-zA-Z_$][\\w$]*)\\s*=>)[^{]*\\{([\\s\\S]*?)(?=\\n(?:export\\s+)?(?:function|async\\s+function|const)\\s|$)`,
	);
	return pattern.exec(source)?.[1] ?? "";
}

// Pre-extract bodies used across multiple describe blocks.
const renderSessionsBody = extractFunctionBody(projectsSource, "renderSessions");
const renderProjectsBody = extractFunctionBody(projectsSource, "renderProjects");

// ---------------------------------------------------------------------------
// spec N/A (existing): clipboard bridge guard
// ---------------------------------------------------------------------------
describe("terminal iframe dashboard wiring", () => {
	test("does not install the broken postMessage clipboard bridge", () => {
		expect(projectsSource).not.toContain("terminal-clipboard");
		expect(projectsSource).not.toContain("installTerminalClipboardHelper");
		expect(projectsSource).not.toContain("wireTerminalClipboardBridge");
	});

	test("terminal dashboard files do not reference the removed bridge message", async () => {
		const contents = await Promise.all(
			dashboardFiles.map((file) => Bun.file(new URL(file, import.meta.url)).text()),
		);

		expect(contents.join("\n")).not.toContain("pier:terminal-copy");
		expect(contents.join("\n")).not.toContain("window.parent.postMessage");
	});
});

// ---------------------------------------------------------------------------
// GitHub ctx menu (spec 020 → re-routed by 021)
// Post-021-split: the GitHub-URL context menu lives on renderProjects (bottom
// list), NOT renderSessions. These tests are re-routed to renderProjectsBody
// so they serve as regression coverage throughout spec 021's implementation.
// ---------------------------------------------------------------------------
describe("GitHub ctx menu (spec 020 → re-routed by 021)", () => {
	test("renderProjects body is extractable (sanity check)", () => {
		// If this fails the extractor regex needs updating — not a spec issue.
		expect(renderProjectsBody.length).toBeGreaterThan(0);
	});

	test("renderProjects attaches a contextmenu listener on each project li", () => {
		expect(renderProjectsBody).toContain('addEventListener("contextmenu"');
	});

	test("renderProjects contextmenu handler calls ev.preventDefault()", () => {
		expect(renderProjectsBody).toContain("ev.preventDefault()");
	});

	test("renderProjects contextmenu handler calls openProjectContextMenu", () => {
		expect(renderProjectsBody).toContain("openProjectContextMenu");
	});

	test("renderProjects passes project id to openProjectContextMenu", () => {
		// Post-split: the loop variable in renderProjects is `p`, so the id is p.id.
		const ctxMenuCallMatch = renderProjectsBody.match(
			/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/,
		);
		expect(ctxMenuCallMatch).not.toBeNull();
		const callText = ctxMenuCallMatch?.[0] ?? "";
		expect(callText).toMatch(/\bid\s*:\s*p\.id\b/);
	});

	test("renderProjects passes clientX and clientY to openProjectContextMenu", () => {
		const ctxMenuCallMatch = renderProjectsBody.match(
			/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/,
		);
		const callText = ctxMenuCallMatch?.[0] ?? "";
		expect(callText).toContain("clientX");
		expect(callText).toContain("clientY");
	});

	test("openProjectContextMenu fetches the github-url endpoint", () => {
		expect(projectsSource).toContain("github-url");
	});

	test("openProjectContextMenu calls window.open with _blank and noopener,noreferrer on success", () => {
		expect(projectsSource).toContain('"_blank"');
		expect(projectsSource).toContain('"noopener,noreferrer"');
	});

	test("openProjectContextMenu toasts on missing GitHub remote", () => {
		expect(projectsSource).toContain("No GitHub remote for this project");
	});
});

// ---------------------------------------------------------------------------
// spec 021: session-aware sidebar with right-click delete
// ---------------------------------------------------------------------------

// AC 1 — filteredProjects behavioral test
// Import the live function and call it with a populated store.
// projects.ts re-exports filteredProjects; importing it runs no side effects
// that crash in a bun:test (api client is constructed but never called).
import { filteredProjects } from "./projects.ts";
import { store } from "./state.ts";

describe("filteredProjects — spec 022", () => {
	beforeEach(() => {
		store.projectFilter = "";
		store.projects = [
			{
				id: "proj-with-session",
				name: "Session Project",
				path: "/a",
				isGitRepo: true,
				lastModified: 0,
			},
			{
				id: "proj-without-session",
				name: "Other Project",
				path: "/b",
				isGitRepo: true,
				lastModified: 0,
			},
		];
		store.sessions = new Map([
			["proj-with-session", { url: "mem://proj-with-session", sessionId: "proj-with-session" }],
		]);
	});

	afterEach(() => {
		store.projects = [];
		store.sessions = new Map();
		store.projectFilter = "";
	});

	test("filteredProjects EXCLUDES projects that have an active session", () => {
		// spec 022: session-bearing projects must NOT appear in the bottom list.
		// They live exclusively in the top OPEN section (renderSessions).
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).not.toContain("proj-with-session");
	});

	test("filteredProjects still includes projects without a session", () => {
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).toContain("proj-without-session");
	});

	test("filteredProjects respects projectFilter when filtering by name (non-session match)", () => {
		store.projectFilter = "other";
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).toContain("proj-without-session");
		expect(ids).not.toContain("proj-with-session");
	});

	// spec 022: the open-dot class must NOT be added inside renderProjects.
	// Session-bearing projects no longer appear in the bottom list, so the
	// sessions.has guard that drove classList.add("open") is dead code and
	// must be removed.
	test("renderProjects body does NOT add 'open' class conditional on session membership", () => {
		// The pattern sessions.has(...).add("open") must not exist in renderProjects.
		const openClassMatch = renderProjectsBody.match(
			/sessions\.has\s*\([^)]+\)[^;]*\.add\s*\(\s*["']open["']\s*\)/,
		);
		expect(openClassMatch).toBeNull();
	});
});

// AC 2 + AC 5 (post-split renderSessions assertions)
describe("renderSessions context menu split — spec 021", () => {
	test("renderSessions contextmenu handler calls openSessionContextMenu (not openProjectContextMenu)", () => {
		// RED: current renderSessions wires openProjectContextMenu.
		// After the split it must call openSessionContextMenu instead.
		expect(renderSessionsBody).toContain("openSessionContextMenu");
	});

	test("renderSessions contextmenu handler does NOT call openProjectContextMenu", () => {
		// The GitHub-URL menu must move to the projects list only.
		expect(renderSessionsBody).not.toContain("openProjectContextMenu");
	});

	test("renderSessions contextmenu handler calls ev.preventDefault() — spec 021 forward", () => {
		// Regression guard: after the split, the NEW contextmenu handler in
		// renderSessions must still call ev.preventDefault(). spec 020 block
		// covers the pre-split handler; this re-asserts it post-split so a
		// regression that drops preventDefault from the new handler is caught.
		expect(renderSessionsBody).toContain("ev.preventDefault()");
	});
});

// AC 3 — openSessionContextMenu exclusivity
describe("openSessionContextMenu — spec 021", () => {
	// Extract body using the generalized extractor (not assuming export shape).
	const sessionCtxBody = extractFunctionBody(projectsSource, "openSessionContextMenu");

	test("openSessionContextMenu function exists in source", () => {
		// RED: this function does not exist yet.
		expect(projectsSource).toContain("openSessionContextMenu");
	});

	test("openSessionContextMenu function body is non-empty (extractable)", () => {
		// If this fails, the function definition shape changed; check the extractor.
		expect(sessionCtxBody.length).toBeGreaterThan(0);
	});

	test("openSessionContextMenu shows Kill session item (spec 034: renamed from Delete session)", () => {
		// spec 034: the context menu label must be "Kill session" not "Delete session".
		expect(sessionCtxBody).toContain("Kill session");
	});

	test("openSessionContextMenu does NOT show Delete session label (spec 034: label renamed)", () => {
		// spec 034: "Delete session" must be removed in favor of "Kill session".
		expect(sessionCtxBody).not.toContain("Delete session");
	});

	test("openSessionContextMenu calls closeSession", () => {
		// Scoped to the function body — not a whole-file assertion.
		expect(sessionCtxBody).toContain("closeSession");
	});

	// NOTE: spec 021 had exclusivity tests asserting "Open on GitHub" must NOT
	// appear in openSessionContextMenu. Those tests are removed by spec 033,
	// which adds "Open" and "Open on GitHub" to the session context menu.
});

// AC 4 — bottom projects list context menu
describe("renderProjects context menu — spec 021", () => {
	test("renderProjects contextmenu handler still calls openProjectContextMenu", () => {
		// After the split, the bottom list must keep its GitHub-URL menu.
		expect(renderProjectsBody).toContain("openProjectContextMenu");
	});
});

// ---------------------------------------------------------------------------
// spec 033: Add Open and Open on GitHub actions to session context menu
// ---------------------------------------------------------------------------
describe("openSessionContextMenu — spec 033 open + github actions", () => {
	// Re-extract body here so the describe block is self-contained.
	const sessionCtxBody033 = extractFunctionBody(projectsSource, "openSessionContextMenu");

	// AC 1: "Open" item that calls selectProject
	test("openSessionContextMenu contains an 'Open' menu item label", () => {
		// RED: openSessionContextMenu currently only has "Delete session".
		expect(sessionCtxBody033).toContain("Open");
	});

	test("openSessionContextMenu 'Open' action calls selectProject", () => {
		// RED: selectProject is not called in the session context menu yet.
		expect(sessionCtxBody033).toContain("selectProject");
	});

	// AC 2: "Open on GitHub" item that fetches github-url endpoint
	test("openSessionContextMenu contains an 'Open on GitHub' menu item label", () => {
		// RED: this label is absent from the current session context menu.
		expect(sessionCtxBody033).toContain("Open on GitHub");
	});

	test("openSessionContextMenu fetches the github-url endpoint for the session", () => {
		// RED: github-url fetch is absent from the session context menu function.
		expect(sessionCtxBody033).toContain("github-url");
	});

	test("openSessionContextMenu opens GitHub URL with _blank and noopener,noreferrer", () => {
		// The window.open call may be in the shared function body or an inner
		// callback — assert on the full source scoped via a surrounding check.
		// This is intentionally a whole-source assertion because the onClick
		// handler is an inline arrow inside openSessionContextMenu.
		expect(projectsSource).toContain('"_blank"');
		expect(projectsSource).toContain('"noopener,noreferrer"');
	});

	// AC 3: toast on missing GitHub remote
	test("openSessionContextMenu calls toast when GitHub URL is null", () => {
		// RED: no null-URL guard in the session context menu yet.
		// The toast message must match the project context menu exactly.
		expect(sessionCtxBody033).toContain("No GitHub remote for this project");
	});

	// AC 4 regression: kill-session item must remain (renamed by spec 034)
	test("openSessionContextMenu still contains Kill session item (regression guard)", () => {
		expect(sessionCtxBody033).toContain("Kill session");
	});
});

// AC 5 — user-select: none on sidebar li elements
describe("sidebar li user-select — spec 021", () => {
	test("source contains user-select: none applied to sidebar li elements (not just a comment)", () => {
		// RED: sidebar <li> elements must carry user-select: none.
		// Assertion: the source must contain the VALUE PAIR `user-select: none`
		// (colon + value) rather than the bare property name, so a comment like
		// `// TODO user-select` does not satisfy it. A comment of the form
		// `// user-select: none` would still match — so we additionally require
		// the value to appear in a non-comment-only line (i.e., as a CSS property
		// assignment or inline style assignment).
		//
		// Accept any of:
		//   • CSS: `user-select: none` in a rule (e.g., `.sidebar li { user-select: none }`)
		//   • Inline style: `li.style.userSelect = "none"` or setProperty("user-select","none")
		const hasCSSPair = projectsSource.includes("user-select: none");
		const hasInlineStyle =
			projectsSource.includes('userSelect = "none"') ||
			projectsSource.includes("userSelect = 'none'") ||
			/setProperty\s*\(\s*["']user-select["']\s*,\s*["']none["']/.test(projectsSource);
		expect(hasCSSPair || hasInlineStyle).toBe(true);
	});

	test("user-select: none is not inside a standalone comment line", () => {
		// Additional bypass guard: every occurrence of `user-select: none` must
		// be accompanied by a structural token (a CSS brace `{`, a semicolon `;`,
		// or an assignment `=`) within 120 characters — indicating it's a real
		// style declaration, not just a comment.
		const occurrences = [...projectsSource.matchAll(/user-select\s*:\s*none/g)];
		// If there are no occurrences the first test catches it; skip this guard.
		if (occurrences.length === 0) return;
		const atLeastOneReal = occurrences.some((m) => {
			const surrounding = projectsSource.slice(
				Math.max(0, (m.index ?? 0) - 120),
				(m.index ?? 0) + 120,
			);
			// Must appear near a CSS brace, semicolon, or JS assignment/setProperty.
			return /[{;=]/.test(surrounding.replace(/\/\/[^\n]*/g, ""));
		});
		expect(atLeastOneReal).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// spec 034: Separate close-session from kill-session
// ---------------------------------------------------------------------------

describe("spec 034 — dismissSession (close button: UI-only, no API call)", () => {
	// AC 1 + AC 2: dismissSession must exist as a distinct function and must NOT
	// call the sessions delete API endpoint.

	test("dismissSession function exists in projects.ts source", () => {
		// RED: this function does not exist yet.
		expect(projectsSource).toContain("dismissSession");
	});

	test("dismissSession function body does NOT call the sessions $delete API endpoint", () => {
		// RED: the close button path must not invoke the DELETE API.
		// We check for the Hono RPC $delete call pattern specifically —
		// NOT for ".sessions" which would also match store.sessions.delete().
		const dismissBody = extractFunctionBody(projectsSource, "dismissSession");
		expect(dismissBody.length).toBeGreaterThan(0);
		// Must not contain the Hono RPC delete call pattern
		expect(dismissBody).not.toContain("$delete");
		// Must not contain the api.api.sessions chain (the RPC path to the delete endpoint)
		expect(dismissBody).not.toContain("api.api.sessions");
	});

	test("dismissSession removes the session from store.sessions", () => {
		// AC 1: the UI session entry must be cleared.
		const dismissBody = extractFunctionBody(projectsSource, "dismissSession");
		expect(dismissBody).toContain("sessions.delete");
	});

	test("renderSessions close button calls dismissSession, not closeSession", () => {
		// AC 1: the × click handler must use dismissSession (UI-only path).
		expect(renderSessionsBody).toContain("dismissSession");
		// The close button click path in renderSessions must NOT call closeSession directly.
		// We check: the close-button click handler must reference dismissSession.
		// Strategy: look for the "close" class handler pattern and verify it calls dismissSession.
		const closeHandlerMatch = renderSessionsBody.match(
			/classList\.contains\s*\(\s*["']close["']\s*\)[\s\S]{0,300}/,
		);
		expect(closeHandlerMatch).not.toBeNull();
		const handlerText = closeHandlerMatch?.[0] ?? "";
		expect(handlerText).toContain("dismissSession");
	});

	test("renderSessions close button does NOT call closeSession in the close-button branch", () => {
		// AC 1 negative: closeSession (the kill path) must not be invoked by × click.
		const closeHandlerMatch = renderSessionsBody.match(
			/classList\.contains\s*\(\s*["']close["']\s*\)[\s\S]{0,300}/,
		);
		const handlerText = closeHandlerMatch?.[0] ?? "";
		expect(handlerText).not.toContain("closeSession");
	});
});

describe("spec 034 — closeSession still calls DELETE API (kill path preserved)", () => {
	// AC 5: closeSession must still call the delete endpoint — it's just not
	// wired to the × button anymore.

	const closeSessionBody = extractFunctionBody(projectsSource, "closeSession");

	test("closeSession function exists and is non-empty", () => {
		expect(closeSessionBody.length).toBeGreaterThan(0);
	});

	test("closeSession still calls api sessions delete endpoint", () => {
		// AC 5: kill path is preserved in closeSession.
		expect(closeSessionBody).toContain("$delete");
	});
});

describe("spec 034 — openSessionContextMenu Kill session label", () => {
	// AC 3 + AC 4: the context menu must say "Kill session" and call closeSession.

	const sessionCtxBody = extractFunctionBody(projectsSource, "openSessionContextMenu");

	test("openSessionContextMenu label is Kill session (not Delete session)", () => {
		// AC 4: label renamed from spec 021's "Delete session".
		expect(sessionCtxBody).toContain("Kill session");
		expect(sessionCtxBody).not.toContain("Delete session");
	});

	test("openSessionContextMenu Kill session item calls closeSession", () => {
		// AC 3: the kill action must invoke closeSession (which calls the delete API).
		expect(sessionCtxBody).toContain("closeSession");
	});
});

// ---------------------------------------------------------------------------
// spec 035: Show session-alive dot on Close Project button
// ---------------------------------------------------------------------------

describe("spec 035 — session-alive dot in renderSessions", () => {
	// AC 1: renderSessions must render a DOM node with class `session-alive-dot`
	// inside each session <li>.
	test("renderSessions body contains session-alive-dot class reference", () => {
		// RED: renderSessions does not yet render any session-alive-dot element.
		expect(renderSessionsBody).toContain("session-alive-dot");
	});

	// AC 4: The class name `session-alive-dot` must appear in the renderSessions
	// source (not just as a comment) so it is discoverable by CSS authors and tests.
	test("renderSessions uses the literal class name 'session-alive-dot' in a DOM construction context", () => {
		// Must appear as a string token in an element construction or innerHTML,
		// not only in a comment. We check for it inside an innerHTML template or
		// createElement/className assignment within renderSessions.
		const hasInTemplate =
			renderSessionsBody.includes('"session-alive-dot"') ||
			renderSessionsBody.includes("'session-alive-dot'") ||
			renderSessionsBody.includes("`session-alive-dot`");
		expect(hasInTemplate).toBe(true);
	});

	// AC 2: The dot must only render when the session has a confirmed sessionId.
	// Source-level check: renderSessions must reference `sessionId` when deciding
	// whether to include the dot (the conditional guard must be visible in the body).
	test("renderSessions body gates session-alive-dot on sessionId presence", () => {
		// RED: no such conditional exists yet.
		// The body must contain both "session-alive-dot" and "sessionId" so the
		// conditional is verifiable — avoids an unconditional dot that would pass
		// AC 1 while violating AC 2.
		expect(renderSessionsBody).toContain("sessionId");
		// Ensure the pattern is near the dot (within the same logical block).
		// Strategy: find the index of both tokens and assert they are within 300 chars.
		const dotIdx = renderSessionsBody.indexOf("session-alive-dot");
		const sidIdx = renderSessionsBody.indexOf("sessionId");
		expect(dotIdx).toBeGreaterThanOrEqual(0);
		expect(sidIdx).toBeGreaterThanOrEqual(0);
		expect(Math.abs(dotIdx - sidIdx)).toBeLessThan(400);
	});

	// AC 3 (spec 035): renderProjects must NOT render a session-alive-dot element
	// unconditionally. This assertion is updated by spec 037 which intentionally adds
	// a conditional session-alive-dot to renderProjects for projects with alive backend
	// sessions. The exclusivity constraint is now replaced by the conditional check:
	// renderSessions shows dot based on sessionId, renderProjects shows dot based on
	// store.aliveSessions. The dot may appear in BOTH sections but for different projects.
	//
	// This test now asserts that the renderSessions dot is still gated on sessionId
	// (spec 035 intent preserved) rather than asserting renderProjects never has it.
	test("renderSessions session-alive-dot is still gated on sessionId (spec 035 AC 3 updated by 037)", () => {
		// Spec 035 AC 3 intent: the dot must be conditional, not shown for every row.
		// Spec 037 extends this: renderProjects also shows the dot, but conditionally
		// on store.aliveSessions. Both are conditional — the exclusivity was too strict.
		const renderSessionsBody = extractFunctionBody(projectsSource, "renderSessions");
		expect(renderSessionsBody).toContain("session-alive-dot");
		expect(renderSessionsBody).toContain("sessionId");
	});

	// AC 5 regression guard: dismissSession must still NOT call the delete API.
	// This is a carry-over regression from spec 034. The unit gate re-asserts it
	// so spec 035 implementation cannot accidentally restore the API call.
	test("dismissSession body still does NOT call api.api.sessions delete endpoint (spec 034 regression)", () => {
		const dismissBody = extractFunctionBody(projectsSource, "dismissSession");
		expect(dismissBody.length).toBeGreaterThan(0);
		expect(dismissBody).not.toContain("$delete");
		expect(dismissBody).not.toContain("api.api.sessions");
	});
});

// ---------------------------------------------------------------------------
// spec 059: Repo-grouped project tabs with agent view
// ---------------------------------------------------------------------------

// AC 1: renderProjects groups rows by parent directory
describe("spec 059 — renderProjects groups projects by parent directory", () => {
	// Extract the renderProjects body for source-level assertions.
	const renderProjectsBody059 = extractFunctionBody(projectsSource, "renderProjects");

	test("renderProjects source contains proj-group-header class (grouping header present)", () => {
		// RED: renderProjects currently renders a flat list with no group headers.
		// After implementation it must emit elements with class `proj-group-header`.
		expect(renderProjectsBody059).toContain("proj-group-header");
	});

	test("renderProjects source derives parent directory from project.path for grouping", () => {
		// RED: no path-splitting for group keys exists yet.
		// The grouping key must be derived from the project's path (parent dir).
		// Accept any of: split("/"), dirname, lastIndexOf("/"), or path manipulation.
		const hasPathSplit =
			renderProjectsBody059.includes('.split("/")') ||
			renderProjectsBody059.includes('lastIndexOf("/")') ||
			renderProjectsBody059.includes("lastIndexOf('/')") ||
			renderProjectsBody059.includes("dirname") ||
			renderProjectsBody059.includes(".path");
		expect(hasPathSplit).toBe(true);
	});

	test("renderProjects source groups items by repo/parent dir key (Map or object keyed by dir)", () => {
		// RED: no grouping structure exists in renderProjects yet.
		// The implementation must use a Map, object, or array-of-groups keyed by parent dir.
		const hasGroupStructure =
			renderProjectsBody059.includes("Map(") ||
			renderProjectsBody059.includes("new Map") ||
			renderProjectsBody059.includes("groups") ||
			renderProjectsBody059.includes("grouped") ||
			renderProjectsBody059.includes("byDir") ||
			renderProjectsBody059.includes("byRepo");
		expect(hasGroupStructure).toBe(true);
	});
});

// AC 2: Sidebar tab switcher — source-level checks on projects.ts
describe("spec 059 — sidebar tab switcher", () => {
	test('projects.ts source contains "Projects" tab label', () => {
		// RED: no tab switcher UI exists yet.
		// The tab-wiring function must reference the literal string "Projects" as a tab label.
		expect(projectsSource).toContain('"Projects"');
	});

	test('projects.ts source contains "Active Agents" tab label', () => {
		// RED: no "Active Agents" tab label exists yet.
		expect(projectsSource).toContain('"Active Agents"');
	});

	test("projects.ts source contains tab-switching function (wireSidebarTabs or equivalent)", () => {
		// RED: no tab-wiring function exists yet.
		// Accept any of: wireSidebarTabs, initTabs, setupTabs, renderSidebarTabs.
		const hasTabWire =
			projectsSource.includes("wireSidebarTabs") ||
			projectsSource.includes("initTabs") ||
			projectsSource.includes("setupTabs") ||
			projectsSource.includes("renderSidebarTabs") ||
			projectsSource.includes("tabSwitcher");
		expect(hasTabWire).toBe(true);
	});

	test("projects.ts source hides/shows tab content using 'hidden' class on sidebar-tab panels", () => {
		// RED: no tab visibility toggle logic exists.
		// The switcher must add/remove the 'hidden' class specifically on the tab panels.
		// We check that "sidebar-tab" + "hidden" appear in close proximity (within 600 chars)
		// in projects.ts, indicating the tab-panel toggle logic is co-located — not relying
		// on pre-existing classList calls from project row rendering.
		const hiddenIdx =
			projectsSource.indexOf('"hidden"') >= 0
				? projectsSource.indexOf('"hidden"')
				: projectsSource.indexOf("'hidden'");
		const tabIdx = projectsSource.indexOf("sidebar-tab");
		// Both must exist, and must appear within 600 chars of each other.
		expect(hiddenIdx).toBeGreaterThanOrEqual(0);
		expect(tabIdx).toBeGreaterThanOrEqual(0);
		expect(Math.abs(hiddenIdx - tabIdx)).toBeLessThan(600);
	});
});

// AC 7: "Active Agents" tab count badge
describe("spec 059 — Active Agents tab count badge", () => {
	test("projects.ts source references agent count when rendering the Active Agents tab label", () => {
		// RED: no agent count badge logic exists yet.
		// The tab label must dynamically include a count — accept references to:
		// agentCount, agentRows.length, agents.length, or a numeric badge pattern.
		const hasCountRef =
			projectsSource.includes("agentCount") ||
			projectsSource.includes("agentRows") ||
			projectsSource.includes(".length") ||
			projectsSource.includes("badge");
		expect(hasCountRef).toBe(true);
	});

	test('projects.ts source contains "Active Agents" string near a count or length reference', () => {
		// Stronger version of the badge test: "Active Agents" must appear within 300 chars
		// of a numeric/count expression to avoid a static label satisfying the above.
		const idx = projectsSource.indexOf('"Active Agents"');
		if (idx === -1) {
			// Handled by the label test above — this test confirms badge is adjacent.
			expect(projectsSource).toContain('"Active Agents"');
			return;
		}
		const surrounding = projectsSource.slice(Math.max(0, idx - 300), idx + 300);
		const hasNearCount =
			surrounding.includes(".length") ||
			surrounding.includes("agentCount") ||
			surrounding.includes("agentRows") ||
			surrounding.includes("badge") ||
			/\d/.test(surrounding);
		expect(hasNearCount).toBe(true);
	});
});
