#!/usr/bin/env bun

// smoke-post-merge-sweep-hook.ts
// spec 029 workflow gate: prove that lefthook.yml wires a post-merge hook
// that invokes the worktree auto-sweep entrypoint, AND that the entrypoint
// itself exits cleanly when there are no merged spec branches to close.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const LEFTHOOK_YML = join(REPO_ROOT, "lefthook.yml");
const WORKTREE_CLOSE = join(REPO_ROOT, "scripts", "worktree-close.ts");

// ---------- Part 1: contract check on lefthook.yml ----------
// Must contain a `post-merge:` block whose command invokes worktree-close.
const lefthook = readFileSync(LEFTHOOK_YML, "utf8");
if (!/^post-merge:\s*$/m.test(lefthook)) {
	console.error(`FAIL contract: ${LEFTHOOK_YML} missing top-level \`post-merge:\` block`);
	console.error("  fix: add a post-merge block invoking worktree-close.ts");
	process.exit(1);
}

// Look for the worktree-close invocation anywhere within the post-merge
// block — be tolerant of nested command names and yaml indentation.
// Slice from `post-merge:` up to the next top-level key (any non-whitespace
// at column 0) or end-of-file.
const lines = lefthook.split("\n");
const startIdx = lines.findIndex((l) => /^post-merge:\s*$/.test(l));
let endIdx = lines.length;
for (let i = startIdx + 1; i < lines.length; i += 1) {
	if (lines[i].length > 0 && !/^\s/.test(lines[i])) {
		endIdx = i;
		break;
	}
}
const postMergeBlock = lines.slice(startIdx, endIdx).join("\n");
if (!/scripts\/worktree-close\.ts/.test(postMergeBlock)) {
	console.error(
		"FAIL contract: lefthook.yml `post-merge:` block does not invoke `scripts/worktree-close.ts`",
	);
	console.error(`  block was:\n${postMergeBlock}`);
	process.exit(1);
}

// ---------- Part 2: entrypoint health ----------
// Run worktree-close.ts in a tmp git repo with no spec branches and no
// worktrees. Asserts exit 0 and the expected "nothing to close" output —
// proves the auto-sweep entrypoint won't crash when fired post-pull on a
// quiescent state (which is the most common case).
const tmp = mkdtempSync(join(tmpdir(), "smoke-029-"));

async function git(args: string[]): Promise<{ code: number; stderr: string }> {
	const proc = Bun.spawn(["git", "-C", tmp, ...args], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	return { code, stderr };
}

await git(["init", "--initial-branch=main"]);
await git(["commit", "--allow-empty", "-m", "init"]);

const proc = Bun.spawn(["bun", WORKTREE_CLOSE], {
	cwd: tmp,
	stdout: "pipe",
	stderr: "pipe",
});
const [code, stdout, stderr] = await Promise.all([
	proc.exited,
	new Response(proc.stdout).text(),
	new Response(proc.stderr).text(),
]);

rmSync(tmp, { recursive: true, force: true });

if (code !== 0) {
	console.error(
		`FAIL entrypoint: \`bun scripts/worktree-close.ts\` exited ${code} on a quiescent tmp repo (expected 0)`,
	);
	console.error("stdout:", stdout);
	console.error("stderr:", stderr);
	process.exit(1);
}

if (!stdout.toLowerCase().includes("no merged spec")) {
	console.error(
		`FAIL entrypoint: stdout missing "no merged spec branches" message — script may be silently misbehaving`,
	);
	console.error("stdout:", stdout);
	process.exit(1);
}

console.log("smoke-029: PASS");
