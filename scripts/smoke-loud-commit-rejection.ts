#!/usr/bin/env bun

// smoke-loud-commit-rejection.ts
// spec 030 workflow gate: prove that lefthook.yml's biome pre-commit
// command emits a single explicit "✖ COMMIT REJECTED" line on stderr
// when biome lint fails — eliminating the silent-rollback failure mode
// observed during specs 028 and 029.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const LEFTHOOK_YML = join(REPO_ROOT, "lefthook.yml");
const REJECTION_MARKER = "✖ COMMIT REJECTED";

// ---------- Part 1: contract check on lefthook.yml ----------
// The biome pre-commit command must end with a shell-OR wrapper that
// echoes the rejection marker to stderr on non-zero exit.
const lefthook = readFileSync(LEFTHOOK_YML, "utf8");
const lines = lefthook.split("\n");
const biomeRunIdx = lines.findIndex((l) => /\bbiome\s+check\b.*\{staged_files\}/.test(l));
if (biomeRunIdx < 0) {
	console.error(`FAIL contract: ${LEFTHOOK_YML} missing a biome pre-commit run line`);
	process.exit(1);
}
const biomeRun = lines[biomeRunIdx];
if (!biomeRun.includes(REJECTION_MARKER)) {
	console.error(
		`FAIL contract: lefthook.yml biome run line does not echo "${REJECTION_MARKER}" on failure`,
	);
	console.error(`  current: ${biomeRun.trim()}`);
	console.error(`  fix: append \`|| (echo "${REJECTION_MARKER} — ..." >&2; exit 1)\``);
	process.exit(1);
}
if (!biomeRun.includes(">&2") || !biomeRun.includes("exit 1")) {
	console.error(
		"FAIL contract: lefthook.yml biome run wrapper must redirect to stderr (>&2) and exit 1",
	);
	console.error(`  current: ${biomeRun.trim()}`);
	process.exit(1);
}

// ---------- Part 2: behavioural experiment ----------
// Reconstruct the biome command pipeline against fixture files and assert
// the wrapper's stderr output matches what the contract promises.
const tmp = mkdtempSync(join(tmpdir(), "smoke-030-"));

const dirtyFile = join(tmp, "dirty.ts");
const cleanFile = join(tmp, "clean.ts");

// `dirty.ts` — `noExplicitAny` is an `error` in biome.json and is NOT
// auto-fixable, so `--write` cannot rescue it. Biome exits non-zero.
writeFileSync(dirtyFile, "export const x: any = 1;\n");
// `clean.ts` — passes biome lint with no fixes needed.
writeFileSync(cleanFile, "export const x: number = 1;\n");

async function runWrapped(file: string): Promise<{ code: number; stderr: string }> {
	// Mirror the wrapper structure that lefthook.yml uses, but invoke from
	// the repo root so biome.json is picked up the same way lefthook would.
	const cmd = `bunx biome check --write --no-errors-on-unmatched ${file} || (echo "${REJECTION_MARKER} — biome lint failed; see log above and re-stage after fixing" >&2; exit 1)`;
	const proc = Bun.spawn(["bash", "-c", cmd], {
		cwd: REPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	return { code, stderr };
}

const dirty = await runWrapped(dirtyFile);
if (dirty.code === 0) {
	console.error(
		"FAIL experiment-A: dirty fixture passed lint — adjust fixture so biome --write cannot rescue it",
	);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (!dirty.stderr.includes(REJECTION_MARKER)) {
	console.error(
		`FAIL experiment-A: dirty fixture failed lint but stderr did NOT include "${REJECTION_MARKER}"`,
	);
	console.error("  stderr:", dirty.stderr);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

const clean = await runWrapped(cleanFile);
if (clean.code !== 0) {
	console.error(`FAIL experiment-B: clean fixture rejected (exit ${clean.code})`);
	console.error("  stderr:", clean.stderr);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (clean.stderr.includes(REJECTION_MARKER)) {
	console.error("FAIL experiment-B: clean fixture stderr leaked the rejection marker");
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
console.log("smoke-030: PASS");
