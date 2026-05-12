/**
 * Gate — spec 044: Add dark/light mode theming (e2e)
 *
 * Standalone Bun script that verifies the structural prerequisites for the
 * dark/light mode theming feature. Checks are filesystem-level (no live
 * browser required) so they run in CI without a running dev server.
 *
 * Checks:
 *   1. theme.css exists at apps/frontend/src/styles/theme.css
 *   2. theme.css defines both [data-theme="dark"] and [data-theme="light"] blocks
 *   3. theme.ts exists at apps/frontend/src/dashboard/theme.ts
 *   4. theme.ts exports initTheme (wires toggle + localStorage)
 *   5. index.astro references "pier-theme" localStorage key (inline init before first paint)
 *   6. index.astro contains a [data-testid="theme-toggle"] element
 *
 * RED: theme.css and theme.ts do not exist yet → checks 1, 3 fail.
 *
 * Exits 0 when all checks pass, 1 on first failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function fail(msg: string): never {
	console.error(`[e2e-044] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[e2e-044] ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// Check 1 — theme.css exists
// ---------------------------------------------------------------------------
{
	const themeCssPath = join(repoRoot, "apps/frontend/src/styles/theme.css");
	if (!existsSync(themeCssPath)) {
		fail("Check 1: apps/frontend/src/styles/theme.css does not exist");
	}
	pass("Check 1: theme.css exists");
}

// ---------------------------------------------------------------------------
// Check 2 — theme.css defines both selector blocks
// ---------------------------------------------------------------------------
{
	const themeCssPath = join(repoRoot, "apps/frontend/src/styles/theme.css");
	const css = readFileSync(themeCssPath, "utf8");
	if (!/\[data-theme="dark"\]/.test(css)) {
		fail('Check 2: theme.css missing [data-theme="dark"] selector');
	}
	if (!/\[data-theme="light"\]/.test(css)) {
		fail('Check 2: theme.css missing [data-theme="light"] selector');
	}
	pass("Check 2: theme.css defines both dark and light selector blocks");
}

// ---------------------------------------------------------------------------
// Check 3 — theme.ts exists
// ---------------------------------------------------------------------------
{
	const themeTs = join(repoRoot, "apps/frontend/src/dashboard/theme.ts");
	if (!existsSync(themeTs)) {
		fail("Check 3: apps/frontend/src/dashboard/theme.ts does not exist");
	}
	pass("Check 3: theme.ts exists");
}

// ---------------------------------------------------------------------------
// Check 4 — theme.ts exports initTheme
// ---------------------------------------------------------------------------
{
	const themeTs = join(repoRoot, "apps/frontend/src/dashboard/theme.ts");
	const src = readFileSync(themeTs, "utf8");
	if (!/export\s+(function|const)\s+initTheme/.test(src)) {
		fail("Check 4: theme.ts does not export initTheme");
	}
	pass("Check 4: theme.ts exports initTheme");
}

// ---------------------------------------------------------------------------
// Check 5 — index.astro references pier-theme localStorage key in <head>
// ---------------------------------------------------------------------------
{
	const indexAstro = join(repoRoot, "apps/frontend/src/pages/index.astro");
	if (!existsSync(indexAstro)) {
		fail("Check 5: apps/frontend/src/pages/index.astro does not exist");
	}
	const src = readFileSync(indexAstro, "utf8");
	if (!src.includes("pier-theme")) {
		fail('Check 5: index.astro does not reference "pier-theme" localStorage key');
	}
	pass('Check 5: index.astro references "pier-theme"');
}

// ---------------------------------------------------------------------------
// Check 6 — index.astro has a theme-toggle element
// ---------------------------------------------------------------------------
{
	const indexAstro = join(repoRoot, "apps/frontend/src/pages/index.astro");
	const src = readFileSync(indexAstro, "utf8");
	if (!src.includes('data-testid="theme-toggle"')) {
		fail('Check 6: index.astro missing element with data-testid="theme-toggle"');
	}
	pass('Check 6: index.astro has data-testid="theme-toggle" element');
}

console.log("[e2e-044] all checks passed");
