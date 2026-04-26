/**
 * Spec-awareness: check whether an active spec currently targets a given file path.
 * Used by enforce.ts to gate edits to protected paths.
 *
 * Resolves the enclosing repo root by walking up from `filePath` until a `.git`
 * entry (file or directory) is found. This makes the guard work when edits land
 * inside a git worktree whose active specs live in the worktree's own
 * `specs/active/`, not the main repo's. Falls back to `cwd` when no `.git` is
 * found (preserves original behaviour for callers outside any repo).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRepoRoot(filePath: string): string | null {
	let dir = dirname(resolve(filePath));
	while (true) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function activeSpecTargetsFile(cwd: string, filePath: string): boolean {
	const repoRoot = findRepoRoot(filePath) ?? cwd;
	const activeDir = join(repoRoot, "specs", "active");
	if (!existsSync(activeDir)) return false;
	const rel = filePath.startsWith(`${repoRoot}/`) ? filePath.slice(repoRoot.length + 1) : filePath;
	for (const slug of readdirSync(activeDir)) {
		if (slug.startsWith("_") || slug.startsWith(".")) continue;
		const proposal = join(activeDir, slug, "proposal.md");
		if (!existsSync(proposal)) continue;
		const body = readFileSync(proposal, "utf-8");
		if (body.includes(filePath) || (rel !== filePath && body.includes(rel))) return true;
	}
	return false;
}
