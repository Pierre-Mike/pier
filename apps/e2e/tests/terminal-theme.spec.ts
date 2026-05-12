/**
 * Gate — spec 045: Sync iframe terminal theme with UI theme (e2e)
 *
 * Standalone Bun script. Filesystem checks only — no live browser required.
 * Runs in CI without a running dev server.
 *
 * Checks:
 *   1. terminal-theme.ts exists at apps/frontend/src/dashboard/terminal-theme.ts
 *   2. terminal-theme.ts exports syncTerminalTheme (source text check)
 *   3. theme.ts imports or calls syncTerminalTheme (source text check)
 *   4. design.md at specs/active/045-sync-terminal-theme/design.md (or archive)
 *      contains an "## Implementation", "## Limitation", or "## Investigation" section
 *
 * RED: terminal-theme.ts does not exist → check 1 fails.
 *
 * Exits 0 when all checks pass, 1 on first failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function fail(msg: string): never {
	console.error(`[e2e-045] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[e2e-045] ok: ${msg}`);
}

// Check 1: terminal-theme.ts exists
const terminalThemePath = join(repoRoot, "apps/frontend/src/dashboard/terminal-theme.ts");
if (!existsSync(terminalThemePath)) {
	fail("apps/frontend/src/dashboard/terminal-theme.ts does not exist — implementation missing");
}
pass("terminal-theme.ts exists");

// Check 2: terminal-theme.ts exports syncTerminalTheme
const terminalThemeSource = readFileSync(terminalThemePath, "utf8");
if (!/export\s+(function|const)\s+syncTerminalTheme/.test(terminalThemeSource)) {
	fail("terminal-theme.ts does not export syncTerminalTheme — export missing or misnamed");
}
pass("terminal-theme.ts exports syncTerminalTheme");

// Check 3: theme.ts imports/calls syncTerminalTheme
const themePath = join(repoRoot, "apps/frontend/src/dashboard/theme.ts");
if (!existsSync(themePath)) {
	fail("apps/frontend/src/dashboard/theme.ts does not exist");
}
const themeSource = readFileSync(themePath, "utf8");
if (!themeSource.includes("syncTerminalTheme")) {
	fail(
		"theme.ts does not reference syncTerminalTheme — theme.ts must wire the terminal theme sync",
	);
}
pass("theme.ts references syncTerminalTheme");

// Check 4: design.md documents the investigation
const designPath = join(repoRoot, "specs/active/045-sync-terminal-theme/design.md");
// design.md may be archived by the time this runs post-implementation
const archivePaths = [
	join(repoRoot, "specs/archive/2026-05-12-045-sync-terminal-theme/design.md"),
	join(repoRoot, "specs/archive/2026-05-13-045-sync-terminal-theme/design.md"),
];
const resolvedDesign = existsSync(designPath)
	? designPath
	: archivePaths.find((p) => existsSync(p));
if (!resolvedDesign) {
	fail("design.md not found at specs/active/045-sync-terminal-theme/design.md");
}
const designSource = readFileSync(resolvedDesign, "utf8");
const hasInvestigationSection =
	designSource.includes("## Implementation") ||
	designSource.includes("## Limitation") ||
	designSource.includes("## Investigation");
if (!hasInvestigationSection) {
	fail("design.md must contain ## Implementation, ## Limitation, or ## Investigation section");
}
pass("design.md documents investigation outcome");

console.log("[e2e-045] All checks passed.");
process.exit(0);
