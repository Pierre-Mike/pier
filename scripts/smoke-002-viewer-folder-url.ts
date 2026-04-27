/**
 * Smoke gate for spec 002: Open project folder in VS Code Insiders.
 *
 * Verifies that vscodeFolderUrl is exported from viewer.ts and that
 * the Folder ↗ anchor text appears in the viewer module source.
 *
 * Exits 0 on success, 1 on failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const VIEWER_PATH = join(REPO_ROOT, "apps/frontend/src/dashboard/viewer.ts");

function fail(msg: string): never {
	console.error(`[smoke-002] FAIL: ${msg}`);
	process.exit(1);
}

// 1. viewer.ts must exist
if (!existsSync(VIEWER_PATH)) {
	fail(`viewer.ts not found at ${VIEWER_PATH}`);
}

const source = readFileSync(VIEWER_PATH, "utf-8");

// 2. vscodeFolderUrl must be exported
if (!/export\s+function\s+vscodeFolderUrl/.test(source)) {
	fail("vscodeFolderUrl is not exported from viewer.ts");
}

// 3. Folder ↗ anchor text must appear in viewer.ts
if (!source.includes("Folder ↗")) {
	fail('viewer.ts does not contain "Folder ↗" anchor text');
}

// 4. Open project folder in VSCode Insiders title must appear
if (!source.includes("Open project folder in VSCode Insiders")) {
	fail('viewer.ts does not contain title "Open project folder in VSCode Insiders"');
}

console.log("[smoke-002] PASS");
