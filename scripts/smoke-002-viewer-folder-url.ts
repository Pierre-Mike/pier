/**
 * Smoke gate for spec 002: Open project folder in VS Code Insiders.
 *
 * Imports the pure renderViewerHead helper from viewer.ts and asserts
 * against the returned HTML string — not against source text. This
 * closes all four adversarial bypasses identified in the attempt-1 review:
 *   (a) strings in comment blocks — irrelevant; we test rendered output
 *   (b) hardcoded href — we assert href === vscodeFolderUrl(root, id)
 *   (c) wrong anchor ordering — we assert character-index order
 *   (d) helper exported but never called — renderViewerHead IS the call path
 *
 * Exits 0 on success, 1 on failure.
 */

// NOTE: renderViewerHead and vscodeFolderUrl do not exist yet — this
// script will fail (RED) until the implementer adds them to viewer.ts.
// The import itself will throw, causing a non-zero exit. That is correct
// RED behaviour.

import { renderViewerHead, vscodeFolderUrl } from "../apps/frontend/src/dashboard/viewer.ts";

const TEST_PROJECT_ID = "alpha";
const TEST_PATH = "src/index.ts";
const TEST_NAME = "index.ts";
const TEST_PROJECTS_ROOT = "/srv/projects/";

function fail(msg: string): never {
	console.error(`[smoke-002] FAIL: ${msg}`);
	process.exit(1);
}

// Call the pure render helper with known inputs.
// This must NOT require a DOM, a running server, or any mocks.
let html: string;
try {
	// appConfig is a module-level import in viewer.ts; renderViewerHead must
	// accept projectsRoot as a parameter (or default from appConfig) so it
	// can be called in isolation. The spec requires it to be callable without
	// DOM or network I/O — if it throws here, the implementation is wrong.
	html = renderViewerHead(TEST_PROJECT_ID, TEST_PATH, TEST_NAME);
} catch (e) {
	fail(`renderViewerHead threw: ${e}`);
}

// ── 1. Folder ↗ anchor must be present in the rendered output ───────────────
const folderAnchorMatch = html.match(/<a\s[^>]*>Folder\s*↗<\/a>/);
if (!folderAnchorMatch) {
	fail('rendered head HTML does not contain an <a> with text "Folder ↗"');
}

// ── 2. href must equal vscodeFolderUrl(projectsRoot, projectId) ─────────────
// We extract the href attribute from the matched anchor. The implementer must
// pass projectsRoot into renderViewerHead (or read from appConfig) — either
// way, the href in the rendered string must match the pure helper's output.
const expectedHref = vscodeFolderUrl(TEST_PROJECTS_ROOT, TEST_PROJECT_ID);
// expectedHref = "vscode-insiders://file/srv/projects/alpha"

// Find the Folder ↗ anchor's href attribute
const folderAnchorTagMatch = html.match(/<a\s([^>]*)>Folder\s*↗<\/a>/);
if (!folderAnchorTagMatch) {
	fail("cannot extract attributes from Folder ↗ anchor");
}
const folderAttrs = folderAnchorTagMatch[1];
const hrefMatch = folderAttrs.match(/href="([^"]*)"/);
if (!hrefMatch) {
	fail("Folder ↗ anchor has no href attribute");
}
const actualHref = hrefMatch[1];

// Un-escape HTML attribute entities for comparison
const unescaped = actualHref
	.replace(/&amp;/g, "&")
	.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
if (unescaped !== expectedHref) {
	fail(
		`Folder ↗ href="${unescaped}" does not match vscodeFolderUrl("${TEST_PROJECTS_ROOT}", "${TEST_PROJECT_ID}") = "${expectedHref}"`,
	);
}

// ── 3. title must be correct ────────────────────────────────────────────────
const expectedTitle = "Open project folder in VSCode Insiders";
if (!folderAttrs.includes(`title="${expectedTitle}"`)) {
	fail(`Folder ↗ anchor title is not "${expectedTitle}". attrs: ${folderAttrs}`);
}

// ── 4. Ordering: VSCode ↗ < Folder ↗ < open ↗ ──────────────────────────────
// Find character positions of each anchor's distinguishing text in the HTML.
const idxVSCode = html.indexOf("VSCode ↗");
const idxFolder = html.indexOf("Folder ↗");
const idxOpen = html.indexOf("open ↗");

if (idxVSCode === -1) fail('rendered head HTML does not contain "VSCode ↗" anchor text');
if (idxFolder === -1) fail('rendered head HTML does not contain "Folder ↗" anchor text');
if (idxOpen === -1) fail('rendered head HTML does not contain "open ↗" anchor text');

if (!(idxVSCode < idxFolder)) {
	fail(
		`"Folder ↗" (pos ${idxFolder}) must appear AFTER "VSCode ↗" (pos ${idxVSCode}) in the rendered head`,
	);
}
if (!(idxFolder < idxOpen)) {
	fail(
		`"Folder ↗" (pos ${idxFolder}) must appear BEFORE "open ↗" (pos ${idxOpen}) in the rendered head`,
	);
}

console.log("[smoke-002] PASS");
