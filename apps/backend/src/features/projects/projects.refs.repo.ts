import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

const exec = promisify(execFile);

export type Branch = { name: string; current: boolean };
export type Worktree = {
	path: string;
	relPath: string;
	branch: string | null;
	head: string;
	isMain: boolean;
};
export type Refs = { branches: Branch[]; worktrees: Worktree[] };

export interface RefsService {
	readonly listRefs: (projectId: string) => Effect.Effect<Refs, never, never>;
}

export const RefsService = Context.GenericTag<RefsService>("RefsService");

const projectRootFor = (projectsRoot: string, id: string): string | null => {
	if (!id || id.includes("..") || id.includes("/") || id.startsWith(".")) return null;
	return `${projectsRoot.replace(/\/+$/, "")}/${id}`;
};

const stripPrefix = (line: string, prefix: string): string | null =>
	line.startsWith(prefix) ? line.slice(prefix.length) : null;

const stripRefsHeads = (ref: string): string =>
	ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;

/**
 * Parse `git branch --format='%(HEAD) %(refname:short)'` output.
 * Each line is either "* name" (current) or "  name".
 */
export const parseBranches = (raw: string): Branch[] => {
	const out: Branch[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		const head = line[0];
		const rest = line.slice(2).trim();
		if (!rest) continue;
		// Skip detached HEAD pseudo-branches and worktree-detached entries.
		if (rest.startsWith("(") && rest.endsWith(")")) continue;
		out.push({ name: rest, current: head === "*" });
	}
	out.sort((a, b) => {
		if (a.current && !b.current) return -1;
		if (!a.current && b.current) return 1;
		return a.name.localeCompare(b.name);
	});
	return out;
};

type WorktreeFields = { path: string; head: string; branch: string | null };

const parseWorktreeParagraph = (lines: readonly string[]): WorktreeFields | null => {
	let path = "";
	let head = "";
	let branch: string | null = null;
	for (const line of lines) {
		const p = stripPrefix(line, "worktree ");
		if (p !== null) {
			path = p;
			continue;
		}
		const h = stripPrefix(line, "HEAD ");
		if (h !== null) {
			head = h;
			continue;
		}
		const b = stripPrefix(line, "branch ");
		if (b !== null) {
			branch = stripRefsHeads(b);
			continue;
		}
		if (line === "detached") branch = null;
	}
	return path ? { path, head, branch } : null;
};

const computeRelPath = (path: string, projectRoot: string): string => {
	const rel = relative(projectRoot, path);
	if (rel === "") return ".";
	return rel.startsWith("..") ? path : rel;
};

/**
 * Parse `git worktree list --porcelain` output. Paragraphs separated by
 * blank lines; each has `worktree <path>`, `HEAD <sha>`, and either
 * `branch refs/heads/<name>`, `detached`, or `bare`. The first paragraph
 * is the main worktree.
 */
export const parseWorktrees = (raw: string, projectRoot: string): Worktree[] => {
	const out: Worktree[] = [];
	let isFirst = true;
	for (const para of raw.split(/\n\n+/)) {
		const lines = para.split("\n").filter((l) => l.length > 0);
		if (lines.length === 0) continue;
		const fields = parseWorktreeParagraph(lines);
		const isMain = isFirst;
		isFirst = false;
		if (!fields) continue;
		out.push({
			path: fields.path,
			relPath: computeRelPath(fields.path, projectRoot),
			branch: fields.branch,
			head: fields.head,
			isMain,
		});
	}
	out.sort((a, b) => {
		if (a.isMain && !b.isMain) return -1;
		if (!a.isMain && b.isMain) return 1;
		return a.relPath.localeCompare(b.relPath);
	});
	return out;
};

const runGit = (args: readonly string[]): Effect.Effect<string, never, never> =>
	Effect.tryPromise({
		try: async () => {
			const { stdout } = await exec("git", [...args], {
				maxBuffer: 16 * 1024 * 1024,
			});
			return stdout;
		},
		catch: () => new Error("git failed"),
	}).pipe(Effect.orElseSucceed(() => ""));

export const makeRefsServiceLive = (): Layer.Layer<RefsService, never, ConfigService> =>
	Layer.effect(
		RefsService,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			return {
				listRefs: (projectId) =>
					Effect.gen(function* () {
						const root = projectRootFor(config.projectsRoot, projectId);
						if (!root) return { branches: [], worktrees: [] };
						const branchesRaw = yield* runGit([
							"-C",
							root,
							"branch",
							"--format=%(HEAD) %(refname:short)",
						]);
						const worktreesRaw = yield* runGit(["-C", root, "worktree", "list", "--porcelain"]);
						return {
							branches: parseBranches(branchesRaw),
							worktrees: parseWorktrees(worktreesRaw, root),
						};
					}),
			};
		}),
	);

export const makeRefsServiceTest = (
	fixtures: ReadonlyMap<string, Refs>,
): Layer.Layer<RefsService> =>
	Layer.succeed(RefsService, {
		listRefs: (projectId) =>
			Effect.succeed(fixtures.get(projectId) ?? { branches: [], worktrees: [] }),
	});
