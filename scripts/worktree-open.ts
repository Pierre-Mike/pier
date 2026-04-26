/**
 * Open a worktree for a spec: isolated branch + working directory.
 *
 *   - Refuses unless main is clean and checked out
 *   - Creates `.agentic/worktrees/<slug>` on branch `spec/<slug>` from `main`
 *   - Prints the worktree absolute path on success
 *
 * Usage: bun scripts/worktree-open.ts <slug>
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

async function sh(
	cmd: string[],
	opts: { silent?: boolean; cwd?: string } = {},
): Promise<{ ok: boolean; out: string }> {
	const proc = Bun.spawn(cmd, {
		cwd: opts.cwd,
		stdout: opts.silent ? "pipe" : "inherit",
		stderr: opts.silent ? "pipe" : "inherit",
	});
	const out = opts.silent ? await new Response(proc.stdout).text() : "";
	return { ok: (await proc.exited) === 0, out: out.trim() };
}

async function main(): Promise<void> {
	const slug = process.argv[2];
	if (!slug) {
		console.error("usage: bun scripts/worktree-open.ts <slug>");
		process.exit(1);
	}

	const repoRoot = process.cwd();
	const worktreePath = join(repoRoot, ".agentic", "worktrees", slug);
	const branch = `spec/${slug}`;

	if (existsSync(worktreePath)) {
		console.error(`✖ worktree already exists at ${worktreePath}`);
		process.exit(1);
	}

	const status = await sh(["git", "status", "--porcelain"], { silent: true });
	if (status.out.length > 0) {
		console.error("✖ main has uncommitted changes. Commit or stash before opening a worktree.");
		process.exit(1);
	}

	const currentBranch = await sh(["git", "branch", "--show-current"], { silent: true });
	if (currentBranch.out !== "main") {
		console.error(`✖ not on main (currently on '${currentBranch.out}'). Switch to main first.`);
		process.exit(1);
	}

	const branchExists = await sh(
		["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
		{
			silent: true,
		},
	);
	if (branchExists.ok) {
		console.error(`✖ branch '${branch}' already exists. Delete it or pick a different slug.`);
		process.exit(1);
	}

	const result = await sh(["git", "worktree", "add", worktreePath, "-b", branch, "main"]);
	if (!result.ok) {
		console.error("✖ git worktree add failed");
		process.exit(1);
	}

	console.log("\ninstalling dependencies…");
	const install = await sh(["bun", "install", "--frozen-lockfile"], { cwd: worktreePath });
	if (!install.ok) {
		console.error(
			`✖ bun install --frozen-lockfile failed in ${worktreePath}\n  worktree left in place for diagnostic.`,
		);
		process.exit(1);
	}

	console.log(`\n✓ worktree ready at ${worktreePath} on branch ${branch}`);
}

await main();
