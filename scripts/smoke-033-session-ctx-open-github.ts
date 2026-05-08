/**
 * Smoke gate for spec 033: Add Open and Open on GitHub actions to session context menu.
 *
 * Asserts that `openSessionContextMenu` in projects.ts:
 *   1. Contains an "Open" item that calls `selectProject`.
 *   2. Contains an "Open on GitHub" item that fetches the github-url endpoint.
 *   3. Calls toast("No GitHub remote for this project") on null URL.
 *   4. Still contains "Delete session" (regression guard).
 *
 * RED: openSessionContextMenu currently only has "Delete session".
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

// Extract openSessionContextMenu body
function extractFunctionBody(src: string, name: string): string {
	const pattern = new RegExp(
		`(?:function\\s+${name}\\s*\\(|\\b${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-zA-Z_$][\\w$]*)\\s*=>)[^{]*\\{([\\s\\S]*?)(?=\\n(?:export\\s+)?(?:function|async\\s+function|const)\\s|$)`,
	);
	return pattern.exec(src)?.[1] ?? "";
}

const sessionCtxBody = extractFunctionBody(source, "openSessionContextMenu");

assert(sessionCtxBody.length > 0, "openSessionContextMenu function body is extractable");

// AC 1: "Open" item calls selectProject
assert(
	sessionCtxBody.includes("Open"),
	'openSessionContextMenu contains an "Open" menu item label',
);

assert(
	sessionCtxBody.includes("selectProject"),
	'openSessionContextMenu "Open" action calls selectProject',
);

// AC 2: "Open on GitHub" item fetches github-url
assert(
	sessionCtxBody.includes("Open on GitHub"),
	'openSessionContextMenu contains "Open on GitHub" menu item label',
);

assert(
	sessionCtxBody.includes("github-url"),
	"openSessionContextMenu fetches the github-url endpoint for the session",
);

// AC 3: toast on null GitHub URL
assert(
	sessionCtxBody.includes("No GitHub remote for this project"),
	'openSessionContextMenu toasts "No GitHub remote for this project" on null URL',
);

// Verify window.open is used with safe options (may be in inner arrow callbacks)
// Check the surrounding ~500 chars after "github-url" for window.open usage
const githubUrlIdx = source.indexOf("github-url");
const surroundingAfterGithubUrl =
	githubUrlIdx >= 0 ? source.slice(githubUrlIdx, githubUrlIdx + 600) : "";
assert(
	surroundingAfterGithubUrl.includes('"_blank"'),
	'openSessionContextMenu window.open uses "_blank" target',
);
assert(
	surroundingAfterGithubUrl.includes('"noopener,noreferrer"'),
	'openSessionContextMenu window.open uses "noopener,noreferrer"',
);

// AC 4 regression: Delete session must remain
assert(
	sessionCtxBody.includes("Delete session"),
	'openSessionContextMenu still contains "Delete session" item (regression guard)',
);

if (!ok) {
	process.exit(1);
}

console.log("\nsmoke-033: all checks passed");
process.exit(0);
