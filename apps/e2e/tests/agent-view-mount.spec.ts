/**
 * Gate — spec 057: Wire agent-view mount into dashboard (e2e)
 * Updated by spec 059: agent-view moved from #agent-view-root to #sidebar-tab-agents
 *
 * Standalone bun script verifying agent-view mount wiring in index.astro.
 * Runs via `bun <file>` (tasks:verify path) — no live browser or server required.
 *
 * Checks:
 *   1. index.astro client script references mountAgentView (import)
 *   2. index.astro client script calls mountAgentView(
 *   3. index.astro references sidebar-tab-agents (the new mount point, spec 059)
 *
 * Note: spec 059 moved the mount container from #agent-view-root (Sidebar.astro)
 * to #sidebar-tab-agents. Check 1 is updated accordingly.
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

// Check 1 — mountAgentView referenced (spec 057 core wiring — unchanged by 059)
if (!indexSrc.includes("mountAgentView")) {
	fail("Check 1: index.astro does not import or call mountAgentView — wiring missing");
}
pass("Check 1: index.astro references mountAgentView");

// Check 2 — mountAgentView called with argument
if (!indexSrc.includes("mountAgentView(")) {
	fail("Check 2: index.astro does not call mountAgentView( — call missing");
}
pass("Check 2: index.astro calls mountAgentView(");

// Check 3 — mount target is sidebar-tab-agents (spec 059 moved mount from #agent-view-root)
if (!indexSrc.includes("sidebar-tab-agents")) {
	fail(
		"Check 3: index.astro does not reference sidebar-tab-agents — spec 059 mount target missing",
	);
}
pass("Check 3: index.astro references sidebar-tab-agents mount target");

console.log("[e2e-057] all structural checks passed");
