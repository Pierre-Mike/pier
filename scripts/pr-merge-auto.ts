#!/usr/bin/env bun

/**
 * Wrap `gh pr merge --auto --squash --delete-branch` with deterministic
 * outcome reporting. Surfaces the silent-rejection race where gh returns
 * `Pull request is in clean status (enablePullRequestAutoMerge)` and the
 * auto-merge never queues — observed multiple times in the /retro chain.
 *
 * Usage: bun scripts/pr-merge-auto.ts <pr-number-or-url>
 *
 * Env:
 *   PIER_PR_MERGE_GH_BIN   — path to gh binary (default: "gh"). Hermetic-stubbable.
 *   PIER_PR_MERGE_TIMEOUT_MS — override the 10s poll window (used by the smoke).
 *
 * Exit codes:
 *   0 — outcome printed (queued OR not-queued); both are valid states.
 *   1 — invalid argv or unrecoverable gh error.
 */

const pr = process.argv[2];
if (!pr) {
	console.error("usage: bun scripts/pr-merge-auto.ts <pr-number-or-url>");
	process.exit(1);
}

const ghBin = process.env.PIER_PR_MERGE_GH_BIN ?? "gh";
const timeoutMs = Number.parseInt(process.env.PIER_PR_MERGE_TIMEOUT_MS ?? "10000", 10);
const pollIntervalMs = 1500;

interface AutoMergeView {
	readonly autoMergeRequest: { readonly enabledAt?: string } | null;
}

async function gh(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn([ghBin, ...args], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

// Step 1: attempt to enable auto-merge. Don't fail on non-zero — gh may
// emit the "clean status" GraphQL response and we determine outcome from
// the subsequent view, not from this exit code.
await gh(["pr", "merge", "--auto", "--squash", "--delete-branch", pr]);

// Step 2: poll the auto-merge state. The race is short — usually the field
// flips within 1-2 seconds of the merge call. Cap at timeoutMs (10s default).
const start = Date.now();
let queued = false;

while (Date.now() - start < timeoutMs) {
	const view = await gh(["pr", "view", pr, "--json", "autoMergeRequest"]);
	if (view.code === 0) {
		try {
			const parsed = JSON.parse(view.stdout) as AutoMergeView;
			if (parsed.autoMergeRequest !== null && parsed.autoMergeRequest !== undefined) {
				queued = true;
				break;
			}
		} catch {
			// Fall through and retry — view returned non-JSON noise.
		}
	}
	await new Promise((r) => setTimeout(r, pollIntervalMs));
}

if (queued) {
	console.log(`✓ auto-merge queued for ${pr}`);
	process.exit(0);
}

console.log(`✖ AUTO-MERGE NOT QUEUED for ${pr}`);
console.log("  gh returned 'clean status' (race after CI completed pre-queue).");
console.log("  Wait for CI green, then run:");
console.log(`    gh pr merge --squash --delete-branch ${pr}`);
process.exit(0);
