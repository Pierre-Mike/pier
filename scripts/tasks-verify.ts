// @no-test: integration CLI; exercises real git and filesystem — tested via bun run tasks:verify
/**
 * Runs the gate for every active spec, dispatched on `kind`. Also enforces
 * per-task boundary annotations: if a task declares `boundary: [glob,...]`
 * and its `file_targets` overlap the git diff for this spec, every changed
 * file must match at least one boundary glob — otherwise the spec fails
 * with an offending-files list.
 *
 * Single source of truth for "is this spec done?"
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { gateEntries, gatePaths, listActiveSpecs, type Spec, taskGates } from "./_lib";
import { checkWorkflow } from "./gates/smoke";
import { checkWriteup } from "./gates/writeup";
import { type ParsedTask, parseTasksFile, validateBoundary } from "./spec-lint";

interface GateResult {
	pass: boolean;
	message: string;
}

const REPO_ROOT = process.cwd();

async function sh(cmd: readonly string[]): Promise<{ ok: boolean; out: string }> {
	const proc = Bun.spawn([...cmd], { stdout: "pipe", stderr: "pipe" });
	const out = await new Response(proc.stdout).text();
	const code = await proc.exited;
	return { ok: code === 0, out };
}

async function specCreationCommit(specRelDir: string): Promise<string | null> {
	const { out } = await sh([
		"git",
		"log",
		"--diff-filter=A",
		"--format=%H",
		"--",
		`${specRelDir}/proposal.md`,
	]);
	const shas = out.split("\n").filter(Boolean);
	return shas[shas.length - 1] ?? null;
}

async function specCreationRef(specRelDir: string): Promise<string> {
	const sha = await specCreationCommit(specRelDir);
	// Empty-tree ref: compare against everything
	if (!sha) return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
	return `${sha}^`;
}

/** Files committed in the RED (spec creation) commit — tester artifacts, exempt from implementer boundary checks. */
async function testerCommittedFiles(specRelDir: string): Promise<ReadonlySet<string>> {
	const sha = await specCreationCommit(specRelDir);
	if (!sha) return new Set();
	const { out } = await sh(["git", "diff", "--name-only", `${sha}^`, sha]);
	return new Set(out.split("\n").filter(Boolean));
}

async function changedFilesSince(ref: string): Promise<readonly string[]> {
	const { out } = await sh(["git", "diff", "--name-only", ref, "HEAD"]);
	return out.split("\n").filter(Boolean);
}

async function runGateEntry(entryPath: string): Promise<GateResult> {
	const abs = join(REPO_ROOT, entryPath);
	if (!existsSync(abs)) {
		return { pass: false, message: `gate artifact missing at ${entryPath}` };
	}
	if (entryPath.endsWith(".test.ts")) {
		const proc = Bun.spawn(["bun", "test", abs], { stdout: "inherit", stderr: "inherit" });
		const code = await proc.exited;
		return {
			pass: code === 0,
			message: code === 0 ? `tests pass (${entryPath})` : `tests failed (${entryPath})`,
		};
	}
	if (entryPath.endsWith(".ts")) {
		const proc = Bun.spawn(["bun", abs], { stdout: "inherit", stderr: "inherit" });
		const code = await proc.exited;
		return {
			pass: code === 0,
			message: code === 0 ? `script pass (${entryPath})` : `script failed (${entryPath})`,
		};
	}
	return {
		pass: false,
		message: `unknown gate file extension for ${entryPath} — only .ts files are supported`,
	};
}

async function verifyGate(spec: Spec): Promise<GateResult> {
	// For workflow and writeup kinds, keep using the existing specialized checkers
	switch (spec.frontmatter.kind) {
		case "workflow":
			return checkWorkflow(gatePaths(spec));
		case "writeup":
			return checkWriteup(gatePaths(spec));
	}

	// Slice-aware gate verification: use per-task gates when they exist.
	// Only run gates for slices whose .gate-frozen-<N> sentinel is present.
	const slices = taskGates(spec.dir);
	if (slices.length > 0) {
		const frozenSlices = slices.filter((s) => s.frozen);
		if (frozenSlices.length === 0) {
			// No slices frozen yet (scaffold state) — nothing to enforce; green.
			return { pass: true, message: "no frozen slices (scaffold state)" };
		}
		for (const slice of frozenSlices) {
			const result = await runGateEntry(slice.gatePath);
			if (!result.pass) return result;
		}
		return { pass: true, message: `${frozenSlices.length} frozen slice gate(s) pass` };
	}

	// For code and rule kinds with no per-task gates: iterate proposal-level gate entries
	let entries: { path: string; level: string }[];
	try {
		entries = [...gateEntries(spec)];
	} catch (err) {
		return {
			pass: false,
			message: `invalid gate: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (entries.length === 0) {
		return { pass: false, message: "no gate entries defined" };
	}

	for (const entry of entries) {
		const result = await runGateEntry(entry.path);
		if (!result.pass) return result;
	}
	return { pass: true, message: `${entries.length} gate(s) pass` };
}

/**
 * Per-task boundary check. A task is in-scope (and thus subject to the
 * boundary) only if at least one of its `file_targets` appears in the diff.
 * For each in-scope task we re-scope the diff to that task's file_targets —
 * this prevents cross-talk where one task's diff trips another task's
 * boundary.
 */
async function verifyBoundaries({
	spec,
	changedFiles,
}: {
	readonly spec: Spec;
	readonly changedFiles: readonly string[];
}): Promise<GateResult> {
	const tasks = parseTasksFile(join(spec.dir, "tasks.md"));
	if (tasks.length === 0) return { pass: true, message: "no tasks" };

	const changedSet = new Set(changedFiles);
	const failures: string[] = [];

	// Per-task check: for any task that has both a boundary AND has touched
	// at least one of its file_targets, scope the changed files down to that
	// task's declared file_targets and validate.
	for (const task of tasks) {
		if (task.boundary === undefined) continue;
		const taskChanges = task.file_targets.filter((f) => changedSet.has(f));
		if (taskChanges.length === 0) continue; // task hasn't been touched yet

		const scopedChanges = scopeChangesToTask({ task, changedFiles });
		const result = validateBoundary({
			task,
			changedFiles: scopedChanges,
			repoRoot: REPO_ROOT,
		});
		if (!result.ok) {
			failures.push(
				`task ${task.index} "${task.title.slice(0, 60)}" — offending files: ${result.offendingFiles.join(", ")}`,
			);
		}
	}

	// Union check: every changed file must match the union of all task
	// boundaries (plus the spec's own directory — authoring spec docs is
	// always allowed). Gate paths are excluded: they are committed by the
	// spec-tester before implementation begins and are intentionally not in
	// any task boundary (they are frozen, not authored by the implementer).
	const boundedTasks = tasks.filter(
		(t): t is ParsedTask & { boundary: readonly string[] } => t.boundary !== undefined,
	);
	if (boundedTasks.length > 0) {
		const specRelDir = spec.dir.startsWith(`${REPO_ROOT}/`)
			? spec.dir.slice(REPO_ROOT.length + 1)
			: spec.dir;
		// Exclude all files committed by the tester in the RED (spec creation) commit.
		// This covers the gate files and any other tester artifacts that are intentionally
		// outside task boundaries.
		const testerFiles = await testerCommittedFiles(specRelDir);
		const eligibleChanges = changedFiles.filter((f) => !testerFiles.has(f));
		const unionBoundary = [...new Set(boundedTasks.flatMap((t) => t.boundary)), `${specRelDir}/**`];
		const union = validateBoundary({
			task: { boundary: unionBoundary },
			changedFiles: eligibleChanges,
			repoRoot: REPO_ROOT,
		});
		if (!union.ok) {
			failures.push(
				`orphan edits (outside every task boundary): ${union.offendingFiles.join(", ")}`,
			);
		}
	}

	if (failures.length === 0) {
		return { pass: true, message: "boundary checks pass" };
	}
	return {
		pass: false,
		message: `boundary violation:\n    ${failures.join("\n    ")}`,
	};
}

/**
 * The set of changed files to test against a task's boundary. A file is in
 * the task's scope if it is one of the task's declared `file_targets` (this
 * keeps the check local to what the task meant to touch).
 */
function scopeChangesToTask({
	task,
	changedFiles,
}: {
	readonly task: ParsedTask;
	readonly changedFiles: readonly string[];
}): readonly string[] {
	const targets = new Set(task.file_targets);
	return changedFiles.filter((f) => targets.has(f));
}

async function main(): Promise<void> {
	const specs = listActiveSpecs();
	if (specs.length === 0) {
		console.log("no active specs to verify.");
		return;
	}

	let anyFail = false;
	for (const spec of specs) {
		const gateResult = await verifyGate(spec);
		const gateMark = gateResult.pass ? "✓" : "✖";
		console.log(
			`${gateMark} ${spec.frontmatter.id} (${spec.frontmatter.kind}) — ${gateResult.message}`,
		);
		if (!gateResult.pass) {
			anyFail = true;
			continue;
		}

		const specRelDir = spec.dir.startsWith(`${REPO_ROOT}/`)
			? spec.dir.slice(REPO_ROOT.length + 1)
			: spec.dir;
		const ref = await specCreationRef(specRelDir);
		const changedFiles = await changedFilesSince(ref);
		const boundary = await verifyBoundaries({ spec, changedFiles });
		const bMark = boundary.pass ? "✓" : "✖";
		console.log(`${bMark} ${spec.frontmatter.id} boundary — ${boundary.message}`);
		if (!boundary.pass) anyFail = true;
	}

	if (anyFail) process.exit(1);
}

await main();
