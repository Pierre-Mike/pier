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

	// AC 4 regression: Delete session item must remain
	test("openSessionContextMenu still contains Delete session item (regression guard)", () => {
		expect(sessionCtxBody033).toContain("Delete session");
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

	test("dismissSession function body does NOT call api.api.sessions delete endpoint", () => {
		// RED: the close button path must not invoke the DELETE API.
		const dismissBody = extractFunctionBody(projectsSource, "dismissSession");
		expect(dismissBody.length).toBeGreaterThan(0);
		// Must not contain the delete call pattern
		expect(dismissBody).not.toContain("$delete");
		expect(dismissBody).not.toContain(".sessions");
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
