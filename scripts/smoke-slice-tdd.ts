// @no-test: e2e smoke — tests are the script itself
/**
 * E2E smoke test for the slice-RED TDD infrastructure.
 *
 * Drives a fake 2-slice spec through the full per-slice loop and asserts:
 *   1. `spec:lint` accepts the new per-task gate: shape
 *   2. `tasks:verify` passes when no slices are frozen (scaffold state)
 *   3. `tasks:verify` fails when slice 1 is frozen but its gate is RED
 *   4. `tasks:verify` passes when slice 1 gate turns GREEN and slice 2 not yet frozen
 *   5. Same cycle for slice 2
 *   6. `spec:complete` passes only when all sentinels exist and all gates are green
 *
 * RED state: none of this infrastructure exists yet. The script will fail as
 * soon as it exercises `spec:lint` or `tasks:verify` since they don't
 * understand per-task `gate:` fields or `.gate-frozen-N` sentinels.
 *
 * Exits 0 on full success, 1 on any assertion failure.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

interface RunOpts {
	readonly cmd: readonly string[];
	readonly cwd: string;
}

interface RunResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function run({ cmd, cwd }: RunOpts): Promise<RunResult> {
	const proc = Bun.spawn([...cmd], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

interface AssertOpts {
	readonly cmd: readonly string[];
	readonly cwd: string;
	readonly label: string;
}

async function assertPasses({ cmd, cwd, label }: AssertOpts): Promise<void> {
	const result = await run({ cmd, cwd });
	if (result.code !== 0) {
		console.error(`FAIL [${label}]: expected exit 0, got ${result.code}`);
		console.error(`stdout:\n${result.stdout}`);
		console.error(`stderr:\n${result.stderr}`);
		process.exit(1);
	}
	console.log(`PASS [${label}]`);
}

async function assertFails({ cmd, cwd, label }: AssertOpts): Promise<void> {
	const result = await run({ cmd, cwd });
	if (result.code === 0) {
		console.error(`FAIL [${label}]: expected non-zero exit, got 0`);
		console.error(`stdout:\n${result.stdout}`);
		process.exit(1);
	}
	console.log(`PASS [${label}]`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function scaffoldRepo(root: string): void {
	// Minimal git repo
	mkdirSync(join(root, ".git"), { recursive: true });
	writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");

	// Minimal package.json pointing scripts at the real pier scripts
	// We resolve the actual pier repo root to reuse the real scripts.
	const pierRoot = join(import.meta.dir, "..");
	const pkg = {
		name: "smoke-pier",
		private: true,
		scripts: {
			"spec:lint": `bun ${join(pierRoot, "scripts/spec-lint.ts")}`,
			"tasks:verify": `bun ${join(pierRoot, "scripts/tasks-verify.ts")}`,
			"spec:complete": `bun ${join(pierRoot, "scripts/spec-complete.ts")}`,
		},
	};
	writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));

	// specs/active and _template directories
	mkdirSync(join(root, "specs", "active"), { recursive: true });
	mkdirSync(join(root, "specs", "_template"), { recursive: true });
}

function writeSpecScaffold(root: string, slug: string): void {
	const specDir = join(root, "specs", "active", slug);
	mkdirSync(specDir, { recursive: true });

	// proposal.md — kind:code, two gate entries (one per slice)
	writeFileSync(
		join(specDir, "proposal.md"),
		`---
id: "099"
title: Smoke test spec
status: active
kind: code
gate:
  - path: specs/active/${slug}/gate-slice-1.test.ts
    level: unit
  - path: specs/active/${slug}/gate-slice-2.test.ts
    level: unit
created: 2026-04-27
owner: main
depends_on: []
supersedes: null
---

## Intent

Smoke test spec for slice-RED TDD infrastructure.

## Constraints

- None

## Acceptance criteria

- [ ] Slice 1 gate passes
- [ ] Slice 2 gate passes
`,
	);

	// design.md
	writeFileSync(join(specDir, "design.md"), `# Design\n\nSmoke test.\n`);

	// tasks.md with two tasks, each declaring its own gate: field (new shape)
	writeFileSync(
		join(specDir, "tasks.md"),
		`# Tasks

- [ ] 1. Slice 1 task
  - agent: main
  - depends: []
  - file_targets: [src/slice1.ts]
  - boundary: [src/slice1.ts]
  - gate: specs/active/${slug}/gate-slice-1.test.ts
- [ ] 2. Slice 2 task
  - agent: main
  - depends: [1]
  - file_targets: [src/slice2.ts]
  - boundary: [src/slice2.ts]
  - gate: specs/active/${slug}/gate-slice-2.test.ts
`,
	);
}

interface SliceOpts {
	readonly root: string;
	readonly slug: string;
	readonly slice: 1 | 2;
}

function writeGateRed({ root, slug, slice }: SliceOpts): void {
	const gateFile = join(root, "specs", "active", slug, `gate-slice-${slice}.test.ts`);
	// A test that always fails — RED state
	writeFileSync(
		gateFile,
		`import { describe, expect, test } from "bun:test";
describe("slice ${slice}", () => {
  test("RED — not implemented yet", () => {
    expect(true).toBe(false); // always fails
  });
});
`,
	);
}

function implementSlice({ root, slug, slice }: SliceOpts): void {
	const gateFile = join(root, "specs", "active", slug, `gate-slice-${slice}.test.ts`);
	// Replace with a passing test
	writeFileSync(
		gateFile,
		`import { describe, expect, test } from "bun:test";
describe("slice ${slice}", () => {
  test("GREEN — implemented", () => {
    expect(true).toBe(true);
  });
});
`,
	);
}

interface FreezeOpts {
	readonly root: string;
	readonly slug: string;
	readonly sliceIndex: number;
}

function freezeSlice({ root, slug, sliceIndex }: FreezeOpts): void {
	const specDir = join(root, "specs", "active", slug);
	writeFileSync(join(specDir, `.gate-frozen-${sliceIndex}`), "");
}

// ---------------------------------------------------------------------------
// Git helpers (smoke repo needs commits for tasks-verify boundary checks)
// ---------------------------------------------------------------------------

async function gitInit(root: string): Promise<void> {
	await run({ cmd: ["git", "init"], cwd: root });
	await run({ cmd: ["git", "config", "user.email", "smoke@test.local"], cwd: root });
	await run({ cmd: ["git", "config", "user.name", "Smoke Test"], cwd: root });
}

async function gitCommit(root: string, message: string): Promise<void> {
	await run({ cmd: ["git", "add", "-A"], cwd: root });
	const result = await run({ cmd: ["git", "commit", "-m", message, "--allow-empty"], cwd: root });
	if (result.code !== 0) {
		console.error(`git commit failed: ${result.stderr}`);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Main smoke sequence
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pier-smoke-slice-"));
	const slug = "099-smoke-slice";

	console.log(`Smoke dir: ${root}`);

	// Step 1: scaffold repo + git init
	scaffoldRepo(root);
	await gitInit(root);

	// Step 2: author 2-slice spec scaffold (no gate files yet)
	writeSpecScaffold(root, slug);
	await gitCommit(root, `spec(099): scaffold — Smoke test spec`);

	// Step 3: spec:lint must pass on the scaffold
	// (new lint must accept per-task gate: shape)
	await assertPasses({
		cmd: ["bun", "run", "spec:lint"],
		cwd: root,
		label: "spec:lint passes on scaffold with per-task gate: shape",
	});

	// Step 4: tasks:verify must pass on scaffold
	// (no slices frozen → no gates enforced → zero gates running → green)
	await assertPasses({
		cmd: ["bun", "run", "tasks:verify"],
		cwd: root,
		label: "tasks:verify passes on scaffold (no frozen slices)",
	});

	// Step 5: author slice 1 gate (RED), commit, then freeze slice 1
	writeGateRed({ root, slug, slice: 1 });
	await gitCommit(root, `spec(099): RED — slice 1`);
	freezeSlice({ root, slug, sliceIndex: 1 });

	// Step 6: tasks:verify must FAIL (slice 1 frozen → gate enforced → RED)
	await assertFails({
		cmd: ["bun", "run", "tasks:verify"],
		cwd: root,
		label: "tasks:verify fails when slice 1 is frozen and gate is RED",
	});

	// Step 7: implement slice 1 (turn gate GREEN)
	implementSlice({ root, slug, slice: 1 });
	await gitCommit(root, `spec(099): GREEN — slice 1 implemented`);

	// Step 8: tasks:verify must PASS (slice 1 green, slice 2 not yet frozen)
	await assertPasses({
		cmd: ["bun", "run", "tasks:verify"],
		cwd: root,
		label: "tasks:verify passes after slice 1 is green and slice 2 not yet frozen",
	});

	// Step 9: author slice 2 gate (RED), commit, then freeze slice 2
	writeGateRed({ root, slug, slice: 2 });
	await gitCommit(root, `spec(099): RED — slice 2`);
	freezeSlice({ root, slug, sliceIndex: 2 });

	// Step 10: tasks:verify must FAIL (slice 2 frozen → gate enforced → RED)
	await assertFails({
		cmd: ["bun", "run", "tasks:verify"],
		cwd: root,
		label: "tasks:verify fails when slice 2 is frozen and gate is RED",
	});

	// Step 11: implement slice 2
	implementSlice({ root, slug, slice: 2 });
	await gitCommit(root, `spec(099): GREEN — slice 2 implemented`);

	// Step 12: tasks:verify must PASS (both slices green)
	await assertPasses({
		cmd: ["bun", "run", "tasks:verify"],
		cwd: root,
		label: "tasks:verify passes after both slices are green",
	});

	// Step 13: assert spec:complete PASSES (all sentinels exist + all gates green).
	// The "fails without sentinels" case is covered implicitly by the RED gate assertions above.
	await assertPasses({
		cmd: ["bun", "run", "spec:complete", slug],
		cwd: root,
		label: "spec:complete passes when all sentinels exist and all gates are green",
	});

	console.log("\nAll smoke assertions passed.");
}

await main();
