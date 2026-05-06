import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import type { IssueRef } from "./state.ts";

export class WorktreeError extends Error {
	readonly _tag = "WorktreeError";
	constructor(
		readonly cmd: string,
		readonly stderr: string,
	) {
		super(`worktree: ${cmd}\n${stderr}`);
	}
}

const sh = (cmd: ReadonlyArray<string>, cwd?: string) =>
	Effect.gen(function* () {
		const proc = Bun.spawn(cmd as string[], {
			...(cwd ? { cwd } : {}),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exit, stderr] = yield* Effect.tryPromise({
			try: () => Promise.all([proc.exited, new Response(proc.stderr).text()]),
			catch: (e) => new WorktreeError(cmd.join(" "), String(e)),
		});
		if (exit !== 0) return yield* Effect.fail(new WorktreeError(cmd.join(" "), stderr));
		return undefined;
	});

const slugify = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40) || "issue";

export const branch_for = (issue: IssueRef): string =>
	`auto/issue-${issue.id}-${slugify(issue.title)}`;

export interface WorktreeRef {
	readonly path: string;
	readonly branch: string;
}

export interface WorktreeConfig {
	readonly repo_root: string;
	readonly base_branch: string;
	readonly worktree_root: string;
}

export const default_config = (repo_root: string): WorktreeConfig => ({
	repo_root,
	base_branch: "main",
	worktree_root: join(repo_root, ".agentic", "worktrees"),
});

const branch_exists = (cfg: WorktreeConfig, branch: string) =>
	sh(["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], cfg.repo_root).pipe(
		Effect.map(() => true),
		Effect.catchTag("WorktreeError", () => Effect.succeed(false)),
	);

export const ensure_worktree = (
	cfg: WorktreeConfig,
	issue: IssueRef,
): Effect.Effect<WorktreeRef, WorktreeError> =>
	Effect.gen(function* () {
		const slug = `issue-${issue.id}-${slugify(issue.title)}`;
		const path = join(cfg.worktree_root, slug);
		const branch = `auto/${slug}`;

		if (existsSync(path)) return { path, branch } satisfies WorktreeRef;

		const has_branch = yield* branch_exists(cfg, branch);
		if (has_branch) {
			yield* sh(["git", "worktree", "add", path, branch], cfg.repo_root);
		} else {
			yield* sh(["git", "worktree", "add", path, "-b", branch, cfg.base_branch], cfg.repo_root);
		}
		return { path, branch } satisfies WorktreeRef;
	});

export interface WorktreeAtArgs {
	readonly cfg: WorktreeConfig;
	readonly path: string;
	readonly branch: string;
	readonly base_branch: string;
}

export const ensure_worktree_at = (
	args: WorktreeAtArgs,
): Effect.Effect<WorktreeRef, WorktreeError> =>
	Effect.gen(function* () {
		const { cfg, path, branch, base_branch } = args;
		if (existsSync(path)) return { path, branch } satisfies WorktreeRef;
		const has_branch = yield* branch_exists(cfg, branch);
		if (has_branch) {
			yield* sh(["git", "worktree", "add", path, branch], cfg.repo_root);
		} else {
			yield* sh(["git", "worktree", "add", path, "-b", branch, base_branch], cfg.repo_root);
		}
		return { path, branch } satisfies WorktreeRef;
	});

export const slice_worktree_path = (args: {
	readonly cfg: WorktreeConfig;
	readonly parent_slug: string;
	readonly slice_id: string;
}) => join(args.cfg.worktree_root, `${args.parent_slug}__slice-${args.slice_id}`);

export const pull_ff = (wt: WorktreeRef): Effect.Effect<void, WorktreeError> =>
	sh(["git", "pull", "--ff-only"], wt.path);

export const commit_and_push_files = (req: {
	readonly wt: WorktreeRef;
	readonly files: ReadonlyArray<string>;
	readonly message: string;
}): Effect.Effect<void, WorktreeError> =>
	Effect.gen(function* () {
		const { wt, files, message } = req;
		yield* sh(["git", "add", ...files], wt.path);
		yield* sh(["git", "commit", "-m", message], wt.path);
		yield* sh(["git", "push", "origin", wt.branch], wt.path);
	});

export const remove_worktree = (
	cfg: WorktreeConfig,
	wt: WorktreeRef,
): Effect.Effect<void, WorktreeError> =>
	Effect.gen(function* () {
		if (!existsSync(wt.path)) return;
		yield* sh(["git", "worktree", "remove", "--force", wt.path], cfg.repo_root);
	});
