/**
 * Open a worktree for a spec: isolated branch + working directory.
 *
 *   - Fetches origin/main and creates the worktree from it (local state ignored)
 *   - Creates `.agentic/worktrees/<slug>` on branch `spec/<slug>` from `origin/main`
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
	const args = process.argv.slice(2);
	const force = args.includes("--force");
	const slug = args.find((a) => !a.startsWith("-"));
	if (!slug) {
		console.error("usage: bun scripts/worktree-open.ts <slug> [--force]");
		process.exit(1);
	}

	// Preflight: abort if main CI is red (unless --force)
	const preflightScript = join(process.cwd(), "scripts", "preflight-main-ci.ts");
	const preflightArgs = force ? ["--force"] : [];
	const preflightProc = Bun.spawn(["bun", preflightScript, ...preflightArgs], {
		stdout: "inherit",
		stderr: "inherit",
	});
	const preflightCode = await preflightProc.exited;
	if (preflightCode !== 0) {
		process.exit(preflightCode);
	}

	const repoRoot = process.cwd();
	const worktreePath = join(repoRoot, ".agentic", "worktrees", slug);
	const branch = `spec/${slug}`;

	if (existsSync(worktreePath)) {
		console.error(`✖ worktree already exists at ${worktreePath}`);
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

	console.log("fetching origin/main…");
	const fetch = await sh(["git", "fetch", "origin", "main"]);
	if (!fetch.ok) {
		console.error("✖ git fetch origin main failed");
		process.exit(1);
	}

	const result = await sh(["git", "worktree", "add", worktreePath, "-b", branch, "origin/main"]);
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
