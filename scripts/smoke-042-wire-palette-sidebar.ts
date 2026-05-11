/**
 * Smoke gate for spec 042: Wire palette-sidebar page composition.
 *
 * Verifies four contracts introduced by spec 042:
 *
 * Part 1 — files.ts: refreshFiles must call renderFileTree() AFTER the
 *   `await fetchFolderChildren(projectId, "")` line.
 *
 * Part 2 — index.astro: installPalette({…}) must receive a fetchFileResults
 *   property that references the /api/projects/:id/files/search endpoint
 *   (or the equivalent typed-client call).
 *
 * Part 3 — index.astro: getStore() must NOT contain the dead token
 *   "files: store.files" (field removed in spec 041).
 *
 * Part 4 — files.test.ts: the file must contain a new spec-042 DOM-level
 *   test, and the full test suite must pass.
 *
 * RED: exits 1 — all four contracts fail on the pre-fix codebase.
 * GREEN: exits 0 — all four contracts satisfied after implementation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function fail(part: string, msg: string): never {
	console.error(`[smoke-042] FAIL ${part}: ${msg}`);
	process.exit(1);
}

function pass(part: string, msg: string): void {
	console.log(`[smoke-042] ok   ${part}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Part 1: files.ts — refreshFiles must call renderFileTree() after cache fill
// ---------------------------------------------------------------------------

const filesTs = readFileSync(join(ROOT, "apps/frontend/src/dashboard/files.ts"), "utf-8");

const refreshStart = filesTs.indexOf("export async function refreshFiles");
if (refreshStart < 0) {
	fail("Part 1", "refreshFiles function not found in files.ts");
}

// Slice from the function declaration to the next top-level export.
const afterRefresh = filesTs.slice(refreshStart);
const nextExportOffset = afterRefresh.indexOf("\nexport ", 10); // skip past own "export async"
const refreshBody = nextExportOffset > 0 ? afterRefresh.slice(0, nextExportOffset) : afterRefresh;

const fetchIdxInBody = refreshBody.indexOf("fetchFolderChildren");
const renderIdxInBody = refreshBody.indexOf("renderFileTree");

if (fetchIdxInBody < 0) {
	fail("Part 1", "refreshFiles body missing fetchFolderChildren call");
}
if (renderIdxInBody < 0) {
	fail(
		"Part 1",
		"refreshFiles does not call renderFileTree() — sidebar never updates after project switch",
	);
}
if (renderIdxInBody <= fetchIdxInBody) {
	fail("Part 1", "renderFileTree() must appear AFTER fetchFolderChildren in refreshFiles body");
}

pass("Part 1", "refreshFiles calls renderFileTree() after fetchFolderChildren");

// ---------------------------------------------------------------------------
// Part 2: index.astro — installPalette must receive fetchFileResults pointing
//          at the files/search endpoint
// ---------------------------------------------------------------------------

const indexAstro = readFileSync(join(ROOT, "apps/frontend/src/pages/index.astro"), "utf-8");

if (!indexAstro.includes("fetchFileResults")) {
	fail("Part 2", "installPalette call in index.astro is missing the fetchFileResults property");
}

// The arrow function must reference the search endpoint (typed-client or string).
const hasSearchRef =
	indexAstro.includes("files.search") ||
	indexAstro.includes("files/search") ||
	indexAstro.includes("/files/search");

if (!hasSearchRef) {
	fail(
		"Part 2",
		"fetchFileResults in index.astro must reference the /api/projects/:id/files/search endpoint",
	);
}

pass("Part 2", "installPalette receives fetchFileResults referencing the search endpoint");

// ---------------------------------------------------------------------------
// Part 3: index.astro — must NOT contain dead "files: store.files" reference
// ---------------------------------------------------------------------------

if (indexAstro.includes("files: store.files")) {
	fail(
		"Part 3",
		'index.astro still contains the dead reference "files: store.files" — ' +
			"store.files was removed in spec 041",
	);
}

pass("Part 3", 'no dead "files: store.files" reference in index.astro');

// ---------------------------------------------------------------------------
// Part 4: files.test.ts must contain a spec-042 refreshFiles test, then pass
// ---------------------------------------------------------------------------

const testPath = join(ROOT, "apps/frontend/src/dashboard/files.test.ts");
const testSrc = readFileSync(testPath, "utf-8");

// The new test must be tagged "spec 042" and cover refreshFiles → renderFileTree.
const hasSpec042Test = testSrc.includes("spec 042") && testSrc.includes("refreshFiles");

if (!hasSpec042Test) {
	fail(
		"Part 4",
		"files.test.ts is missing a spec 042 test for refreshFiles → renderFileTree. " +
			'Add a describe block containing "spec 042" that calls refreshFiles and ' +
			"asserts the sidebar renders real entries.",
	);
}

const proc = Bun.spawn(["bun", "test", testPath], {
	stdout: "inherit",
	stderr: "inherit",
});
const exitCode = await proc.exited;
if (exitCode !== 0) {
	fail("Part 4", "bun test on files.test.ts exited non-zero");
}

pass("Part 4", "files.test.ts passes including spec 042 refreshFiles test");

// ---------------------------------------------------------------------------
// All checks passed
// ---------------------------------------------------------------------------
console.log("[smoke-042] PASS — all palette-sidebar wiring contracts verified");
process.exit(0);
