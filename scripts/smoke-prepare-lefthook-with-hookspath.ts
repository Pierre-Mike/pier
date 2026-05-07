#!/usr/bin/env bun

// smoke-prepare-lefthook-with-hookspath.ts
// spec 028 workflow gate: prove that the root `prepare` script unblocks
// `bun install` in fresh worktrees by appending `--force` to the
// `bunx lefthook install` command. Hermetic — uses a tmp git repo with
// `core.hooksPath` set, mirroring the conflict that breaks worktree-open.ts.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const PKG_JSON = join(REPO_ROOT, "package.json");

// ---------- Part 1: contract check ----------
// `prepare` must contain `--force` so `bun install` succeeds in fresh
// worktrees regardless of the inherited `core.hooksPath` setting.
interface PkgJson {
	readonly scripts?: Record<string, string>;
}
const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8")) as PkgJson;
const prepare = pkg.scripts?.prepare ?? "";
if (!prepare.includes("lefthook install")) {
	console.error(
		`FAIL contract: package.json prepare must invoke lefthook install (got: "${prepare}")`,
	);
	process.exit(1);
}
if (!prepare.includes("--force")) {
	console.error(`FAIL contract: package.json prepare must pass --force (got: "${prepare}")`);
	console.error("  fix: change to `bunx lefthook install --force`");
	process.exit(1);
}

// ---------- Part 2: hermetic experiment ----------
// Reproduce the conflict in a tmp git repo, then prove `--force` resolves it.
const tmp = mkdtempSync(join(tmpdir(), "smoke-028-"));
const conflictPath = join(tmp, "ghost-hooks");

async function setupTmpRepo(): Promise<void> {
	const init = Bun.spawn(["git", "init", "--initial-branch=main", tmp], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const initCode = await init.exited;
	if (initCode !== 0) {
		console.error("FAIL setup: git init failed");
		console.error(await new Response(init.stderr).text());
		process.exit(1);
	}
	// Set core.hooksPath in the tmp repo to a path that does NOT exist —
	// matches the real-world state where the parent .git/hooks dir is
	// referenced from a worktree config.
	const setHooks = Bun.spawn(["git", "-C", tmp, "config", "core.hooksPath", conflictPath], {
		stdout: "ignore",
		stderr: "ignore",
	});
	await setHooks.exited;
	// Minimal lefthook config so lefthook has something to install.
	writeFileSync(
		join(tmp, "lefthook.yml"),
		"pre-commit:\n  commands:\n    noop:\n      run: 'true'\n",
	);
}

async function runLefthook(args: string[]): Promise<{ code: number; stderr: string }> {
	const proc = Bun.spawn(["bunx", "lefthook", "install", ...args], {
		cwd: tmp,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	return { code, stderr };
}

await setupTmpRepo();

// Sanity: without --force, lefthook bails on the hooksPath conflict.
const without = await runLefthook([]);
if (without.code === 0) {
	console.error(
		"FAIL experiment-A: `lefthook install` (no flag) succeeded with `core.hooksPath` set — the conflict is no longer reproducible. Either lefthook upstream changed behaviour or the smoke setup is broken; revisit this test before trusting it.",
	);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

// With --force, lefthook installs anyway.
const withForce = await runLefthook(["--force"]);
if (withForce.code !== 0) {
	console.error(
		`FAIL experiment-B: \`lefthook install --force\` exited ${withForce.code} with \`core.hooksPath\` set — the fix does not actually resolve the conflict.`,
	);
	console.error("stderr:", withForce.stderr);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
console.log("smoke-028: PASS");
