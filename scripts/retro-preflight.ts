/**
 * Detects dormant in-flight spec worktrees.
 *
 * A worktree is dormant iff:
 *   1. Path is under `.agentic/worktrees/`
 *   2. Branch matches `^spec/.+$`
 *   3. No PR exists (`gh pr list --state all --head <branch>` returns `[]`)
 *   4. Last commit is >1 hour old
 *
 * Test affordance: reads GIT_WORKTREE_LIST_FIXTURE, GH_PR_LIST_FIXTURE,
 * GIT_LOG_FIXTURE when present; else shells out to real commands.
 *
 * CLI: default prints human-readable text, --json prints JSON array.
 */

export interface DormantSpec {
	slug: string;
	branch: string;
	worktree_path: string;
	age_days: number;
	last_commit_sha: string;
	last_commit_ts: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * List worktrees as { path, branch } pairs.
 * Uses GIT_WORKTREE_LIST_FIXTURE if set (newline-delimited "<path> <branch>").
 */
function listWorktrees(): Array<{ path: string; branch: string }> {
	const fixture = process.env.GIT_WORKTREE_LIST_FIXTURE;
	if (fixture !== undefined) {
		if (fixture.trim() === "") return [];
		return fixture
			.trim()
			.split("\n")
			.map((line) => {
				const idx = line.lastIndexOf(" ");
				return { path: line.slice(0, idx), branch: line.slice(idx + 1) };
			});
	}

	// Real path: git worktree list --porcelain
	const result = Bun.spawnSync(["git", "worktree", "list", "--porcelain"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) return [];

	const out = result.stdout.toString();
	const worktrees: Array<{ path: string; branch: string }> = [];
	let currentPath = "";
	for (const line of out.split("\n")) {
		if (line.startsWith("worktree ")) {
			currentPath = line.slice("worktree ".length).trim();
		} else if (line.startsWith("branch ")) {
			const rawBranch = line.slice("branch ".length).trim();
			// porcelain format: refs/heads/<branch>
			const branch = rawBranch.startsWith("refs/heads/")
				? rawBranch.slice("refs/heads/".length)
				: rawBranch;
			if (currentPath) {
				worktrees.push({ path: currentPath, branch });
				currentPath = "";
			}
		}
	}
	return worktrees;
}

/**
 * Check whether a PR exists for the given branch.
 * Uses GH_PR_LIST_FIXTURE if set (JSON object keyed by "<branch>+state=all").
 */
function hasPR(branch: string): boolean {
	const fixture = process.env.GH_PR_LIST_FIXTURE;
	if (fixture !== undefined) {
		const map = JSON.parse(fixture) as Record<string, unknown[]>;
		const key = `${branch}+state=all`;
		const prs = map[key] ?? [];
		return prs.length > 0;
	}

	// Real path: gh pr list --state all --head <branch> --json number
	const result = Bun.spawnSync(
		["gh", "pr", "list", "--state", "all", "--head", branch, "--json", "number"],
		{ stdout: "pipe", stderr: "pipe" },
	);
	if (result.exitCode !== 0) return false;
	try {
		const prs = JSON.parse(result.stdout.toString()) as unknown[];
		return prs.length > 0;
	} catch {
		return false;
	}
}

/**
 * Get last commit info for a worktree path.
 * Uses GIT_LOG_FIXTURE if set (JSON object keyed by worktree_path → {sha, ts}).
 */
function getLastCommit(worktreePath: string): { sha: string; ts: string } | null {
	const fixture = process.env.GIT_LOG_FIXTURE;
	if (fixture !== undefined) {
		const map = JSON.parse(fixture) as Record<string, { sha: string; ts: string }>;
		return map[worktreePath] ?? null;
	}

	// Real path: git log -1 --format=%H%n%cI <branch>
	const result = Bun.spawnSync(["git", "-C", worktreePath, "log", "-1", "--format=%H%n%cI"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) return null;
	const lines = result.stdout.toString().trim().split("\n");
	const sha = lines[0]?.trim();
	const ts = lines[1]?.trim();
	if (!sha || !ts) return null;
	return { sha, ts };
}

/**
 * Extract slug from worktree path (last path segment).
 */
function slugFromPath(worktreePath: string): string {
	return worktreePath.split("/").filter(Boolean).pop() ?? worktreePath;
}

/**
 * Detect dormant in-flight spec worktrees.
 */
export async function detectDormantWorktrees(): Promise<DormantSpec[]> {
	const worktrees = listWorktrees();
	const now = Date.now();
	const dormant: DormantSpec[] = [];

	for (const wt of worktrees) {
		// Filter 1: path must be under .agentic/worktrees/
		if (!wt.path.includes(".agentic/worktrees/")) continue;

		// Filter 2: branch must match ^spec/.+$
		if (!/^spec\/.+$/.test(wt.branch)) continue;

		// Filter 3: no PR exists
		if (hasPR(wt.branch)) continue;

		// Filter 4: last commit must be >1 hour old
		const commit = getLastCommit(wt.path);
		if (!commit) continue;

		const commitMs = new Date(commit.ts).getTime();
		if (Number.isNaN(commitMs)) continue;
		const ageMs = now - commitMs;
		if (ageMs <= ONE_HOUR_MS) continue;

		const age_days = ageMs / (24 * ONE_HOUR_MS);
		// Use first 8 chars as short sha
		const last_commit_sha = commit.sha.slice(0, 8);

		dormant.push({
			slug: slugFromPath(wt.path),
			branch: wt.branch,
			worktree_path: wt.path,
			age_days,
			last_commit_sha,
			last_commit_ts: commit.ts,
		});
	}

	return dormant;
}

/**
 * Render dormant specs as human-readable text.
 * Returns empty string if none.
 */
function renderText(dormant: DormantSpec[]): string {
	if (dormant.length === 0) return "";
	const lines = dormant.map(
		(d) =>
			`  ${d.worktree_path} (branch ${d.branch}, ${d.age_days.toFixed(2)} days, ${d.last_commit_sha})`,
	);
	return `Dormant in-flight specs:\n${lines.join("\n")}`;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const jsonMode = args.includes("--json");

	const dormant = await detectDormantWorktrees();

	if (jsonMode) {
		process.stdout.write(`${JSON.stringify(dormant)}\n`);
	} else {
		const text = renderText(dormant);
		if (text) process.stdout.write(`${text}\n`);
	}
}
