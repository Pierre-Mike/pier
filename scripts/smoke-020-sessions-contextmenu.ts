/**
 * Smoke gate for spec 020: Right-click → Open on GitHub for active project.
 *
 * Asserts that `renderSessions()` in projects.ts is structurally symmetric with
 * `renderProjects()` with respect to the contextmenu listener:
 *
 *   1. The renderSessions function body contains an addEventListener("contextmenu", …) call.
 *   2. That call is followed by ev.preventDefault() and openProjectContextMenu.
 *   3. renderProjects() also contains the same pattern (regression guard).
 *
 * RED: renderSessions() currently has no contextmenu listener.
 *
 * Exits 0 when all assertions pass, 1 on any failure.
 */

import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const projectsPath = join(REPO_ROOT, "apps", "frontend", "src", "dashboard", "projects.ts");

const source = await Bun.file(projectsPath).text();

let ok = true;

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		ok = false;
	} else {
		console.log(`PASS: ${message}`);
	}
}

// Extract renderSessions body
const renderSessionsMatch = source.match(
	/export function renderSessions\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
);
const renderSessionsBody = renderSessionsMatch?.[1] ?? "";

assert(renderSessionsBody.length > 0, "renderSessions() function body is extractable");

// 1. contextmenu listener is wired in renderSessions
assert(
	renderSessionsBody.includes('addEventListener("contextmenu"'),
	'renderSessions() attaches addEventListener("contextmenu", …) on each session li',
);

// 2. handler calls preventDefault
assert(
	renderSessionsBody.includes("ev.preventDefault()"),
	"renderSessions contextmenu handler calls ev.preventDefault()",
);

// 3. handler calls openProjectContextMenu
assert(
	renderSessionsBody.includes("openProjectContextMenu"),
	"renderSessions contextmenu handler calls openProjectContextMenu",
);

// 4. call passes the project id from loop variable
const ctxMenuCall =
	renderSessionsBody.match(/openProjectContextMenu\s*\(\s*\{[\s\S]{0,200}?\}\s*\)/)?.[0] ?? "";

assert(
	/\bid\s*:\s*pid\b/.test(ctxMenuCall),
	"openProjectContextMenu call in renderSessions passes { id: pid, … }",
);

assert(
	ctxMenuCall.includes("clientX"),
	"openProjectContextMenu call in renderSessions passes clientX",
);

assert(
	ctxMenuCall.includes("clientY"),
	"openProjectContextMenu call in renderSessions passes clientY",
);

// 5. Regression: renderProjects still has its contextmenu listener (symmetry guard)
const renderProjectsMatch = source.match(
	/export function renderProjects\(\)[^{]*\{([\s\S]*?)(?=\nexport (?:function|async function|const))/,
);
const renderProjectsBody = renderProjectsMatch?.[1] ?? "";

assert(
	renderProjectsBody.includes('addEventListener("contextmenu"'),
	"renderProjects() still has its contextmenu listener (regression guard)",
);

// 6. github-url fetch is present in openProjectContextMenu
assert(
	source.includes("github-url"),
	"openProjectContextMenu fetches the /api/projects/:id/github-url endpoint",
);

// 7. window.open with safe options
assert(
	source.includes('"_blank"') && source.includes('"noopener,noreferrer"'),
	'openProjectContextMenu opens URL with "_blank" and "noopener,noreferrer"',
);

// 8. toast on missing remote
assert(
	source.includes("No GitHub remote for this project"),
	'openProjectContextMenu toasts "No GitHub remote for this project" on null url',
);

if (!ok) {
	process.exit(1);
}

console.log("\nsmoke-020: all checks passed");
process.exit(0);
