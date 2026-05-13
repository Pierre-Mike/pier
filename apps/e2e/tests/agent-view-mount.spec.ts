/**
 * Gate — spec 057: Wire agent-view mount into dashboard (e2e)
 *
 * Standalone bun script verifying agent-view mount wiring in index.astro.
 * Runs via `bun <file>` (tasks:verify path) — no live browser or server required.
 *
 * Checks:
 *   1. index.astro contains id="agent-view-root" mount container
 *   2. index.astro client script references mountAgentView (import)
 *   3. index.astro client script calls mountAgentView(
 *
 * RED: none of these conditions hold before implementation → check 1 fails → exit 1.
 *
 * The live Playwright browser assertion is in the companion spec:
 *   apps/e2e/tests/agent-view-mount.browser.spec.ts
 * That file is discovered by the Playwright test runner in the CI e2e suite.
 *
 * Exits 0 when all checks pass, 1 on first failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function fail(msg: string): never {
	console.error(`[e2e-057] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[e2e-057] ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// Structural source checks
// ---------------------------------------------------------------------------

const indexAstroPath = join(repoRoot, "apps/frontend/src/pages/index.astro");
if (!existsSync(indexAstroPath)) {
	fail("apps/frontend/src/pages/index.astro does not exist");
}
const indexSrc = readFileSync(indexAstroPath, "utf8");

// Check 1 — mount container present
if (!indexSrc.includes('id="agent-view-root"') && !indexSrc.includes("id='agent-view-root'")) {
	fail('Check 1: index.astro does not contain id="agent-view-root" — mount container missing');
}
pass('Check 1: index.astro has id="agent-view-root"');

// Check 2 — mountAgentView referenced
if (!indexSrc.includes("mountAgentView")) {
	fail("Check 2: index.astro does not import or call mountAgentView — wiring missing");
}
pass("Check 2: index.astro references mountAgentView");

// Check 3 — mountAgentView called with argument
if (!indexSrc.includes("mountAgentView(")) {
	fail("Check 3: index.astro does not call mountAgentView( — call missing");
}
pass("Check 3: index.astro calls mountAgentView(");

console.log("[e2e-057] all structural checks passed");
