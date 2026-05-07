import { describe, expect, test } from "bun:test";

const projectsSource = await Bun.file(new URL("./projects.ts", import.meta.url)).text();
const dashboardFiles = ["./projects.ts", "./terminal-focus.test.ts"] as const;

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
// ---------------------------------------------------------------------------
describe("renderSessions contextmenu — spec 020", () => {
	// Locate the renderSessions function body in the source for scoped assertions.
	// We extract from "export function renderSessions" to the next "export function"
	// so assertions are scoped to that function, not the whole file.
	const renderSessionsMatch = projectsSource.match(
		/export function renderSessions\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
	);
	const renderSessionsBody = renderSessionsMatch?.[1] ?? "";

	test("renderSessions body is extractable (sanity check)", () => {
		// If this fails the regex above needs updating — not a spec issue.
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
		// RED: the call must pass { id: pid, ... } (or equivalent) so the right
		// project's github-url is fetched.
		// We check that 'id:' and 'pid' appear together in the renderSessions body
		// near the openProjectContextMenu call.
		const ctxMenuCallMatch = renderSessionsBody.match(
			/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/,
		);
		expect(ctxMenuCallMatch).not.toBeNull();
		const callText = ctxMenuCallMatch?.[0] ?? "";
		// The id field must reference the loop variable (pid) — not a hardcoded string.
		expect(callText).toMatch(/\bid\s*:\s*pid\b/);
	});

	test("renderSessions passes clientX and clientY to openProjectContextMenu", () => {
		// RED: the handler must forward mouse coordinates so the menu appears at
		// the right position.
		const ctxMenuCallMatch = renderSessionsBody.match(
			/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/,
		);
		const callText = ctxMenuCallMatch?.[0] ?? "";
		expect(callText).toContain("clientX");
		expect(callText).toContain("clientY");
	});

	test("openProjectContextMenu fetches the github-url endpoint", () => {
		// This is a whole-file assertion: openProjectContextMenu must call the
		// github-url API. It already does in the current code — but we assert it
		// explicitly so a refactor cannot silently remove the fetch.
		expect(projectsSource).toContain("github-url");
	});

	test("openProjectContextMenu calls window.open with _blank and noopener,noreferrer on success", () => {
		// Whole-file: the handler must open the URL in a new tab with safe options.
		expect(projectsSource).toContain('"_blank"');
		expect(projectsSource).toContain('"noopener,noreferrer"');
	});

	test("openProjectContextMenu toasts on missing GitHub remote", () => {
		// Whole-file: the null-url path must surface a user-visible message.
		expect(projectsSource).toContain("No GitHub remote for this project");
	});
});

// ---------------------------------------------------------------------------
// spec 021: session-aware sidebar with right-click delete
// ---------------------------------------------------------------------------

// Extract filteredProjects function body for scoped assertions.
const filteredProjectsMatch = projectsSource.match(
	/export function filteredProjects\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
);
const filteredProjectsBody = filteredProjectsMatch?.[1] ?? "";

// Extract renderSessions body (re-extract for spec 021 assertions).
const renderSessionsMatch021 = projectsSource.match(
	/export function renderSessions\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
);
const renderSessionsBody021 = renderSessionsMatch021?.[1] ?? "";

// Extract renderProjects body for scoped assertions.
const renderProjectsMatch = projectsSource.match(
	/export function renderProjects\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
);
const renderProjectsBody = renderProjectsMatch?.[1] ?? "";

describe("filteredProjects — spec 021", () => {
	test("filteredProjects body is extractable (sanity check)", () => {
		expect(filteredProjectsBody.length).toBeGreaterThan(0);
	});

	test("filteredProjects does NOT filter out session-bearing projects", () => {
		// RED: current implementation has `!store.sessions.has(p.id)` which drops
		// projects that have an active session. The new behaviour must remove that
		// clause so session-bearing projects appear in the bottom list.
		expect(filteredProjectsBody).not.toContain("sessions.has");
	});
});

describe("renderSessions context menu split — spec 021", () => {
	test("renderSessions contextmenu handler calls openSessionContextMenu (not openProjectContextMenu)", () => {
		// RED: current renderSessions wires openProjectContextMenu in its contextmenu
		// handler. After the split it must call openSessionContextMenu instead.
		expect(renderSessionsBody021).toContain("openSessionContextMenu");
	});

	test("renderSessions contextmenu handler does NOT call openProjectContextMenu", () => {
		// RED: the GitHub-URL menu must move to the projects list only.
		expect(renderSessionsBody021).not.toContain("openProjectContextMenu");
	});
});

describe("openSessionContextMenu — spec 021", () => {
	test("openSessionContextMenu function exists in source", () => {
		// RED: this function does not exist yet.
		expect(projectsSource).toContain("openSessionContextMenu");
	});

	test("openSessionContextMenu shows Delete session item", () => {
		// RED: the new context menu must present "Delete session" as its sole action.
		expect(projectsSource).toContain("Delete session");
	});

	test("openSessionContextMenu calls closeSession", () => {
		// Extract openSessionContextMenu body to scope the assertion.
		const sessionCtxMatch = projectsSource.match(
			/function openSessionContextMenu\s*\([^)]*\)[^{]*\{([\s\S]*?)(?=\nfunction |\nexport function |\nexport async function |\nexport const )/,
		);
		const sessionCtxBody = sessionCtxMatch?.[1] ?? "";
		// If the function exists, its body must call closeSession.
		// If the match is empty the function doesn't exist yet — that test above catches it.
		if (sessionCtxBody.length > 0) {
			expect(sessionCtxBody).toContain("closeSession");
		} else {
			// Function absent — force failure with a clear message.
			expect("openSessionContextMenu body").toBe("not found in source");
		}
	});
});

describe("renderProjects context menu — spec 021", () => {
	test("renderProjects contextmenu handler still calls openProjectContextMenu", () => {
		// After the split, the bottom list must keep its GitHub-URL menu.
		expect(renderProjectsBody).toContain("openProjectContextMenu");
	});
});

describe("sidebar li user-select — spec 021", () => {
	test("source contains user-select: none for sidebar list items", () => {
		// RED: sidebar <li> elements must carry user-select: none so the OS-native
		// text-selection context menu cannot leak in.
		expect(projectsSource).toContain("user-select");
	});
});
