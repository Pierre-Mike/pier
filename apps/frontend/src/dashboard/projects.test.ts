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
// spec 020: renderSessions() must attach contextmenu → openProjectContextMenu
// Note: this describe block tests the PRE-SPLIT state. After 021 lands,
// renderSessions switches to openSessionContextMenu; spec 021 block below
// carries the post-split assertions.
// ---------------------------------------------------------------------------
describe("renderSessions contextmenu — spec 020", () => {
	test("renderSessions body is extractable (sanity check)", () => {
		// If this fails the extractor regex needs updating — not a spec issue.
		expect(renderSessionsBody.length).toBeGreaterThan(0);
	});

	test("renderSessions attaches a contextmenu listener on each session li", () => {
		// RED: current renderSessions() has no contextmenu addEventListener call.
		expect(renderSessionsBody).toContain('addEventListener("contextmenu"');
	});

	test("renderSessions contextmenu handler calls ev.preventDefault()", () => {
		// RED: no contextmenu handler exists yet.
		expect(renderSessionsBody).toContain("ev.preventDefault()");
	});

	test("renderSessions contextmenu handler calls openProjectContextMenu", () => {
		// RED: openProjectContextMenu is never called inside renderSessions today.
		expect(renderSessionsBody).toContain("openProjectContextMenu");
	});

	test("renderSessions passes project id to openProjectContextMenu", () => {
		// RED: the call must pass { id: pid, ... }.
		const ctxMenuCallMatch = renderSessionsBody.match(
			/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/,
		);
		expect(ctxMenuCallMatch).not.toBeNull();
		const callText = ctxMenuCallMatch?.[0] ?? "";
		expect(callText).toMatch(/\bid\s*:\s*pid\b/);
	});

	test("renderSessions passes clientX and clientY to openProjectContextMenu", () => {
		const ctxMenuCallMatch = renderSessionsBody.match(
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

describe("filteredProjects — spec 021", () => {
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

	test("filteredProjects includes projects that have an active session", () => {
		// RED: current implementation filters out session-bearing projects.
		// After the fix it must return them.
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).toContain("proj-with-session");
	});

	test("filteredProjects still includes projects without a session", () => {
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).toContain("proj-without-session");
	});

	test("filteredProjects respects projectFilter when filtering by name", () => {
		store.projectFilter = "session";
		const result = filteredProjects();
		const ids = result.map((p) => p.id);
		expect(ids).toContain("proj-with-session");
		expect(ids).not.toContain("proj-without-session");
	});

	// Coverage gap: renderProjects must add "open" class for session-bearing projects.
	// Scoped to the renderProjects body — assert the open-dot CSS class is set when
	// store.sessions.has(p.id) returns true.
	test("renderProjects body adds 'open' class for session-bearing projects (open-dot rendering)", () => {
		// RED: this assertion verifies that the `open` class assignment is tied to
		// session membership inside renderProjects. A comment cannot satisfy this:
		// the body must contain both `sessions.has` AND `"open"` together in a
		// classList call, which is what `li.classList.add("open")` produces when
		// sessions.has(p.id) is the guard.
		expect(renderProjectsBody).toContain('"open"');
		// The open class must be conditional on session membership.
		const openClassMatch = renderProjectsBody.match(
			/sessions\.has\s*\([^)]+\)[^;]*\.add\s*\(\s*["']open["']\s*\)/,
		);
		expect(openClassMatch).not.toBeNull();
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

	test("openSessionContextMenu shows Delete session item", () => {
		// RED: the new context menu must present "Delete session" as its sole action.
		expect(sessionCtxBody).toContain("Delete session");
	});

	test("openSessionContextMenu calls closeSession", () => {
		// Scoped to the function body — not a whole-file assertion.
		expect(sessionCtxBody).toContain("closeSession");
	});

	// AC 3 exclusivity: the session context menu must NOT contain Open on GitHub.
	test("openSessionContextMenu does NOT contain Open on GitHub label", () => {
		// RED: exclusivity check. If an implementer adds both Delete session AND
		// Open on GitHub, this test catches it.
		expect(sessionCtxBody).not.toContain("Open on GitHub");
	});

	test("openSessionContextMenu does NOT contain github-url fetch", () => {
		// Dual exclusivity check: the GitHub URL endpoint must not be called
		// from the session context menu.
		expect(sessionCtxBody).not.toContain("github-url");
	});
});

// AC 4 — bottom projects list context menu
describe("renderProjects context menu — spec 021", () => {
	test("renderProjects contextmenu handler still calls openProjectContextMenu", () => {
		// After the split, the bottom list must keep its GitHub-URL menu.
		expect(renderProjectsBody).toContain("openProjectContextMenu");
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
