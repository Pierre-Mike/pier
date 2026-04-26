/**
 * Close one or more worktrees whose spec branches have been merged into main.
 *
 * Two modes:
 *   - `bun scripts/worktree-close.ts`         — auto-detect all merged spec/* branches, close each
 *   - `bun scripts/worktree-close.ts <slug>`  — close exactly one (refuses if not merged)
 *
 * In both modes:
 *   - Refuses if the worktree has uncommitted changes
 *   - Refuses if the branch is not yet merged into main
 *   - Removes the worktree directory and deletes the local branch
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

async function sh(
	cmd: string[],
	opts: { silent?: boolean; cwd?: string } = {},
): Promise<{ ok: boolean; out: string }> {
	const proc = Bun.spawn(cmd, {
		stdout: opts.silent ? "pipe" : "inherit",
		stderr: opts.silent ? "pipe" : "inherit",
		cwd: opts.cwd,
	});
	const out = opts.silent ? await new Response(proc.stdout).text() : "";
	return { ok: (await proc.exited) === 0, out: out.trim() };
}

async function listSpecBranches(): Promise<string[]> {
	const all = await sh(["git", "branch", "--list", "spec/*", "--format=%(refname:short)"], {
		silent: true,
	});
	return all.out
		.split("\n")
		.map((b) => b.trim())
		.filter(Boolean);
}

/**
 * A branch is "merged" if either:
 *   - it is an ancestor of main (classic merge), or
 *   - GitHub reports a merged PR with this branch as head (covers squash/rebase merges).
 */
async function isMerged(branch: string): Promise<boolean> {
	const ancestry = await sh(["git", "branch", "--merged", "main"], { silent: true });
	const ancestorBranches = ancestry.out.split("\n").map((b) => b.trim().replace(/^\*\s*/, ""));
	if (ancestorBranches.includes(branch)) return true;

	const pr = await sh(
		[
			"gh",
			"pr",
			"list",
			"--state",
			"merged",
			"--head",
			branch,
			"--json",
			"number",
			"-q",
			".[0].number",
		],
		{ silent: true },
	);
	return pr.ok && pr.out.length > 0;
}

async function listMergedSpecBranches(): Promise<string[]> {
	const specs = await listSpecBranches();
	const results = await Promise.all(specs.map(async (b) => ((await isMerged(b)) ? b : null)));
	return results.filter((b): b is string => b !== null);
}

async function closeOne(slug: string, repoRoot: string): Promise<{ ok: boolean; reason?: string }> {
	const worktreePath = join(repoRoot, ".agentic", "worktrees", slug);
	const branch = `spec/${slug}`;

	if (!existsSync(worktreePath)) {
		// Zombie reconcile: worktree dir is gone but the branch may still
		// exist. If the branch is merged, delete it and continue. If not,
		// refuse — don't destroy unpushed work from a manually-cleaned dir.
		if (await isMerged(branch)) {
			const del = await sh(["git", "branch", "-D", branch]);
			if (!del.ok) {
				return { ok: false, reason: `branch '${branch}' deletion failed` };
			}
			return { ok: true };
		}
		return {
			ok: false,
			reason: `no worktree at ${worktreePath} and branch '${branch}' not merged`,
		};
	}

	const status = await sh(["git", "status", "--porcelain"], {
		silent: true,
		cwd: worktreePath,
	});
	if (status.out.length > 0) {
		return { ok: false, reason: "worktree has uncommitted changes" };
	}

	if (!(await isMerged(branch))) {
		return { ok: false, reason: `branch '${branch}' not merged into main` };
	}

	const removeResult = await sh(["git", "worktree", "remove", worktreePath]);
	if (!removeResult.ok) {
		return { ok: false, reason: "git worktree remove failed" };
	}

	// -D (force) because squash/rebase merges leave the local branch non-ancestor
	// of main even though the PR is merged. isMerged() already verified that.
	const deleteBranch = await sh(["git", "branch", "-D", branch]);
	if (!deleteBranch.ok) {
		return { ok: false, reason: `worktree removed but branch '${branch}' deletion failed` };
	}

	return { ok: true };
}

async function main(): Promise<void> {
	const repoRoot = process.cwd();
	const arg = process.argv[2];

	// Reconcile stale .git/worktrees/* admin dirs before any listing, so
	// listMergedSpecBranches() sees an authoritative snapshot and no later
	// step trips on a "prunable" entry.
	await sh(["git", "worktree", "prune"], { silent: true });

	if (arg) {
		// Single-slug strict mode
		const result = await closeOne(arg, repoRoot);
		if (result.ok) {
			console.log(`✓ closed spec/${arg}`);
		} else {
			console.error(`✖ ${result.reason}`);
			process.exit(1);
		}
		return;
	}

	// Auto-detect mode: close every merged spec branch
	const mergedSpecs = await listMergedSpecBranches();
	if (mergedSpecs.length === 0) {
		console.log("no merged spec branches to close.");
		return;
	}

	console.log(`found ${mergedSpecs.length} merged spec branch(es):\n`);
	let anyFail = false;
	for (const branch of mergedSpecs) {
		const slug = branch.replace(/^spec\//, "");
		const result = await closeOne(slug, repoRoot);
		if (result.ok) {
			console.log(`  ✓ ${branch}`);
		} else {
			console.log(`  ✖ ${branch} — ${result.reason}`);
			anyFail = true;
		}
	}
	if (anyFail) process.exit(1);
}

await main();
