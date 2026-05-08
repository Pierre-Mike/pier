#!/usr/bin/env bun

// smoke-e2e-harness.ts
// spec 036 workflow gate: prove that the Playwright e2e harness is wired
// across the workspace, root scripts, CI workflow, and pre-push hook.
// This is a contract+health check — it does NOT spawn browsers or boot the
// app servers (that lives in CI as the `e2e` GH Actions job).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

function assertFileContains(
	path: string,
	patterns: readonly { rx: RegExp; reason: string }[],
): void {
	if (!existsSync(path)) fail(`${path} not found`);
	const body = readFileSync(path, "utf8");
	for (const { rx, reason } of patterns) {
		if (!rx.test(body)) fail(`${path} — ${reason}`);
	}
}

// ---------- Part 1: e2e workspace scaffold ----------
const e2eDir = join(REPO_ROOT, "apps", "e2e");
const e2ePkg = join(e2eDir, "package.json");
const e2eCfg = join(e2eDir, "playwright.config.ts");
const e2eSmoke = join(e2eDir, "tests", "smoke.spec.ts");
const e2eTsconfig = join(e2eDir, "tsconfig.json");

assertFileContains(e2ePkg, [
	{ rx: /"name":\s*"@pier\/e2e"/, reason: "package name must be @pier/e2e" },
	{ rx: /"@playwright\/test"/, reason: "missing @playwright/test devDep" },
	{ rx: /"e2e":\s*"playwright test"/, reason: "missing e2e script" },
	{ rx: /"e2e:install":\s*"playwright install/, reason: "missing e2e:install script" },
]);

assertFileContains(e2eCfg, [
	{ rx: /defineConfig/, reason: "must export defineConfig(...)" },
	{ rx: /webServer/, reason: "must declare webServer entries" },
	{ rx: /5273/, reason: "must reference local-reuse backend port 5273" },
	{ rx: /5274/, reason: "must reference local-reuse frontend port 5274" },
	{ rx: /5283/, reason: "must reference fresh-mode backend port 5283" },
	{ rx: /5284/, reason: "must reference fresh-mode frontend port 5284" },
	{ rx: /reuseExistingServer/, reason: "must guard reuseExistingServer" },
	{ rx: /E2E_FRESH/, reason: "must honor E2E_FRESH env to force fresh boot" },
	{ rx: /PUBLIC_API_URL/, reason: "must inject PUBLIC_API_URL into frontend env" },
]);

assertFileContains(e2eSmoke, [
	{ rx: /from\s+["']@playwright\/test["']/, reason: "must import @playwright/test" },
	{ rx: /\/health/, reason: "must assert backend /health endpoint" },
	{ rx: /toHaveTitle\(["']pier["']\)/, reason: "must assert frontend title 'pier'" },
	{ rx: /E2E_BACKEND_URL/, reason: "must read backend URL from env (port-shift safe)" },
]);

if (!existsSync(e2eTsconfig)) fail(`${e2eTsconfig} not found`);

// ---------- Part 2: root scripts ----------
const rootPkg = join(REPO_ROOT, "package.json");
assertFileContains(rootPkg, [
	{ rx: /"e2e":\s*"cd apps\/e2e/, reason: "missing root e2e script" },
	{ rx: /"e2e:fresh":\s*"cd apps\/e2e && E2E_FRESH=1/, reason: "missing root e2e:fresh script" },
	{ rx: /"e2e:install":\s*"cd apps\/e2e/, reason: "missing root e2e:install script" },
]);

// ---------- Part 3: CI workflow ----------
const ciYml = join(REPO_ROOT, ".github", "workflows", "ci.yml");
const ciBody = existsSync(ciYml) ? readFileSync(ciYml, "utf8") : "";
if (!ciBody) fail(`${ciYml} not found`);

// Find the e2e: job block. Top-level jobs are indented 2 spaces ("  e2e:").
const e2eJobMatch = ciBody.match(/^ {2}e2e:\s*$([\s\S]*?)(?=^ {2}\S|^\S|Z)/m);
if (!e2eJobMatch) fail("ci.yml missing top-level `e2e:` job");
const e2eJob = e2eJobMatch[1] ?? "";
for (const { rx, reason } of [
	{ rx: /needs:\s*check/, reason: "e2e job must declare `needs: check`" },
	{ rx: /bun run e2e:install/, reason: "e2e job must run `bun run e2e:install`" },
	{ rx: /bunx turbo e2e/, reason: "e2e job must run `bunx turbo e2e`" },
	{ rx: /actions\/upload-artifact/, reason: "e2e job must upload playwright-report on failure" },
]) {
	if (!rx.test(e2eJob)) fail(`ci.yml e2e: job — ${reason}`);
}

// ---------- Part 4: pre-push hook ----------
const lefthook = join(REPO_ROOT, "lefthook.yml");
const lefthookBody = existsSync(lefthook) ? readFileSync(lefthook, "utf8") : "";
if (!lefthookBody) fail(`${lefthook} not found`);
const prePushMatch = lefthookBody.match(/^pre-push:\s*$([\s\S]*?)(?=^[a-z]|Z)/m);
if (!prePushMatch) fail("lefthook.yml missing `pre-push:` block");
const prePush = prePushMatch[1] ?? "";
if (!/bun run e2e:fresh/.test(prePush)) {
	fail("lefthook.yml pre-push must invoke `bun run e2e:fresh`");
}

console.log("✓ e2e harness wiring contract holds");
