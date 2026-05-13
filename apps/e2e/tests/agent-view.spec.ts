/**
 * Gate — spec 056 + spec 060: Mirror Claude agent view as a web panel (e2e structural check)
 *
 * Standalone Bun script that verifies structural prerequisites for the agent
 * view panel feature. Checks are filesystem + source-level (no live browser
 * or daemon required) so they run in CI without a running dev server.
 *
 * Checks:
 *   1. agent-view.ts exists at apps/frontend/src/dashboard/agent-view.ts
 *   2. agent-view.ts exports mountAgentView function (AC6 entry point)
 *   3. agent-view.ts renders three group headings: "Needs input", "Working", "Completed"
 *   4. agent-view.ts uses data-group-heading attribute (AC6 structural check)
 *   5. agent-view.ts uses data-attach-button attribute per row (AC7 structural check)
 *   6. agent-view.ts dispatches pier:zellij-launch with claude --resume (spec 060 AC4)
 *   7. agents.routes.ts exists and exports agentsRoute (backend gate)
 *   8. agents.adapt.core.ts exists and exports stateToAgentRow (AC5 gate)
 *   9. dashboard.css contains .agent-view selector (CSS gate)
 *  10. agent-view.ts does NOT use deprecated claude attach (spec 060 AC6)
 *  11. agent-view.ts includes cwd in pier:zellij-launch detail (spec 060 AC5)
 *  12. agent-view.ts AgentRow interface includes sessionId field (spec 060 AC3)
 *  13. agents.adapt.core.ts AgentRow includes sessionId field (spec 060 AC1)
 *
 * Exits 0 when all checks pass, 1 on first failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function fail(msg: string): never {
	console.error(`[e2e-056] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[e2e-056] ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// Check 1 — agent-view.ts exists
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	if (!existsSync(path)) {
		fail("Check 1: apps/frontend/src/dashboard/agent-view.ts does not exist");
	}
	pass("Check 1: agent-view.ts exists");
}

// ---------------------------------------------------------------------------
// Check 2 — mountAgentView is exported
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!/export\s+(async\s+)?function\s+mountAgentView/.test(src)) {
		fail("Check 2: agent-view.ts does not export mountAgentView");
	}
	pass("Check 2: agent-view.ts exports mountAgentView");
}

// ---------------------------------------------------------------------------
// Check 3 — three group label strings present (AC6)
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("Needs input")) {
		fail('Check 3: agent-view.ts missing "Needs input" group label');
	}
	if (
		!src.includes('"Working"') &&
		!src.includes("'Working'") &&
		!src.includes(': "Working"') &&
		!src.includes(": 'Working'")
	) {
		// Accept "Working" anywhere in the source
		if (!src.includes("Working")) {
			fail('Check 3: agent-view.ts missing "Working" group label');
		}
	}
	if (!src.includes("Completed")) {
		fail('Check 3: agent-view.ts missing "Completed" group label');
	}
	pass("Check 3: agent-view.ts contains all three group labels");
}

// ---------------------------------------------------------------------------
// Check 4 — data-group-heading attribute used (AC6 DOM structural check)
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("data-group-heading")) {
		fail("Check 4: agent-view.ts missing data-group-heading attribute");
	}
	pass("Check 4: agent-view.ts uses data-group-heading");
}

// ---------------------------------------------------------------------------
// Check 5 — data-attach-button attribute used (AC7 DOM structural check)
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("data-attach-button")) {
		fail("Check 5: agent-view.ts missing data-attach-button attribute");
	}
	pass("Check 5: agent-view.ts uses data-attach-button");
}

// ---------------------------------------------------------------------------
// Check 6 — pier:zellij-launch with claude --resume (spec 060 AC4)
// RED: agent-view.ts currently uses `claude attach` — this check will FAIL until fixed
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("pier:zellij-launch")) {
		fail("Check 6: agent-view.ts missing pier:zellij-launch custom event");
	}
	if (!src.includes("claude --resume")) {
		fail(
			"Check 6: agent-view.ts missing 'claude --resume' in zellij-launch handler (spec 060 AC4)",
		);
	}
	pass("Check 6: agent-view.ts dispatches pier:zellij-launch with claude --resume");
}

// ---------------------------------------------------------------------------
// Check 7 — agents.routes.ts exists and exports agentsRoute
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/backend/src/features/agents/agents.routes.ts");
	if (!existsSync(path)) {
		fail("Check 7: apps/backend/src/features/agents/agents.routes.ts does not exist");
	}
	const src = readFileSync(path, "utf8");
	if (!src.includes("agentsRoute")) {
		fail("Check 7: agents.routes.ts does not export agentsRoute");
	}
	pass("Check 7: agents.routes.ts exists and exports agentsRoute");
}

// ---------------------------------------------------------------------------
// Check 8 — agents.adapt.core.ts exports stateToAgentRow
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/backend/src/features/agents/agents.adapt.core.ts");
	if (!existsSync(path)) {
		fail("Check 8: apps/backend/src/features/agents/agents.adapt.core.ts does not exist");
	}
	const src = readFileSync(path, "utf8");
	if (!src.includes("stateToAgentRow")) {
		fail("Check 8: agents.adapt.core.ts does not export stateToAgentRow");
	}
	pass("Check 8: agents.adapt.core.ts exports stateToAgentRow");
}

// ---------------------------------------------------------------------------
// Check 9 — dashboard.css contains .agent-view CSS
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/styles/dashboard.css");
	if (!existsSync(path)) {
		fail("Check 9: apps/frontend/src/styles/dashboard.css does not exist");
	}
	const css = readFileSync(path, "utf8");
	if (!css.includes(".agent-view")) {
		fail("Check 9: dashboard.css missing .agent-view CSS selector");
	}
	pass("Check 9: dashboard.css contains .agent-view CSS");
}

// ---------------------------------------------------------------------------
// Check 10 — agent-view.ts does NOT use deprecated claude attach (spec 060 AC6)
// RED: agent-view.ts currently uses `claude attach` — this check will FAIL until fixed
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (src.includes("claude attach")) {
		fail(
			"Check 10: agent-view.ts still uses deprecated 'claude attach' — replace with 'claude --resume' (spec 060 AC6)",
		);
	}
	pass("Check 10: agent-view.ts does not use deprecated claude attach");
}

// ---------------------------------------------------------------------------
// Check 11 — agent-view.ts includes cwd in pier:zellij-launch detail (spec 060 AC5)
// RED: agent-view.ts currently does not pass cwd in the zellij-launch detail
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	// Must have both pier:zellij-launch and cwd in the same detail object
	// A simple check: the detail object must include a cwd property after the launch event
	if (!src.includes("detail: {") && !src.includes("detail:{")) {
		fail("Check 11: agent-view.ts missing detail object in pier:zellij-launch event");
	}
	// Verify cwd appears in the source (it must be passed as detail.cwd)
	if (!/pier:zellij-launch[\s\S]{0,200}cwd/.test(src)) {
		fail("Check 11: agent-view.ts missing cwd in pier:zellij-launch event detail (spec 060 AC5)");
	}
	pass("Check 11: agent-view.ts includes cwd in pier:zellij-launch detail");
}

// ---------------------------------------------------------------------------
// Check 12 — agent-view.ts AgentRow interface includes sessionId (spec 060 AC3)
// RED: agent-view.ts currently does not have sessionId in AgentRow
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/frontend/src/dashboard/agent-view.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("sessionId")) {
		fail("Check 12: agent-view.ts AgentRow interface missing sessionId field (spec 060 AC3)");
	}
	pass("Check 12: agent-view.ts AgentRow includes sessionId");
}

// ---------------------------------------------------------------------------
// Check 13 — agents.adapt.core.ts AgentRow includes sessionId (spec 060 AC1)
// RED: agents.adapt.core.ts currently does not expose sessionId in AgentRow
// ---------------------------------------------------------------------------
{
	const path = join(repoRoot, "apps/backend/src/features/agents/agents.adapt.core.ts");
	const src = readFileSync(path, "utf8");
	if (!src.includes("sessionId")) {
		fail("Check 13: agents.adapt.core.ts AgentRow missing sessionId field (spec 060 AC1)");
	}
	pass("Check 13: agents.adapt.core.ts AgentRow includes sessionId");
}

console.log("[e2e-056] all checks passed");
