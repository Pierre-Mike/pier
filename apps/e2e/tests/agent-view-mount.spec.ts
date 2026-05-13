/**
 * Gate — spec 057: Wire agent-view mount into dashboard (e2e)
 *
 * Two-phase gate script:
 *
 * Phase 1 — structural source checks (bun-native, no server required):
 *   1. index.astro must contain id="agent-view-root" mount container
 *   2. index.astro must import/reference mountAgentView
 *   3. index.astro must call mountAgentView(
 *   Exits 1 immediately if any check fails.
 *
 * Phase 2 — real Playwright browser test:
 *   After structural checks pass, spawns:
 *     bunx playwright test --config apps/e2e/playwright.config.ts
 *                          apps/e2e/tests/agent-view-mount.browser.ts
 *   The browser test opens the dashboard and asserts the three
 *   [data-group-heading] elements are visible.
 *
 * RED: index.astro does not have id="agent-view-root" → check 1 fails → exit 1.
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
// Phase 1 — structural source checks
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

// ---------------------------------------------------------------------------
// Phase 2 — real Playwright browser test
// ---------------------------------------------------------------------------

console.log("[e2e-057] structural checks passed — running Playwright browser test...");

const browserTestFile = join(repoRoot, "apps/e2e/tests/agent-view-mount.browser.ts");
if (!existsSync(browserTestFile)) {
	fail("apps/e2e/tests/agent-view-mount.browser.ts does not exist — Playwright test missing");
}

const proc = Bun.spawn(
	[
		"bunx",
		"playwright",
		"test",
		"--config",
		"apps/e2e/playwright.config.ts",
		"apps/e2e/tests/agent-view-mount.browser.ts",
	],
	{ cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
);

const code = await proc.exited;
if (code !== 0) {
	fail(`Playwright browser test failed (exit ${code})`);
}

console.log("[e2e-057] all checks passed");
