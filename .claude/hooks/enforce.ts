/**
 * Pre-tool-use enforcement: block writes/edits that violate repo invariants.
 *
 * Rules enforced here (deterministic, no LLM):
 *   - apps/backend/wrangler.toml requires an active spec targeting it
 *   - packages/api-contract/** is auto-derived — never edit directly
 *   - specs/archive/** is immutable
 *   - A spec's per-task `gate:` path is frozen once `.gate-frozen-<N>` sentinel
 *     exists (prevents the spec-implementer from editing tests the spec-judge
 *     has already approved — closes the self-collusion loop per slice)
 *
 * Fail-closed discipline:
 *   Claude Code only treats exit code 2 as "block"; any other non-zero exit
 *   (including the default 1 from an uncaught throw) is read as "hook ran
 *   fine, allow." To avoid silently allowing a tool call when this hook hits
 *   a bug, the entire body is wrapped in a catch-all that logs to stderr and
 *   calls `process.exit(2)`. Never `process.exit(1)` from a hook.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { activeSpecTargetsFile } from "./spec-guard";
import { block, type ToolEvent } from "./types";

function findRepoRoot(filePath: string, fallback: string): string {
	let dir = dirname(resolve(filePath));
	while (true) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return fallback;
		dir = parent;
	}
}

/**
 * Parse the per-task gate: fields from a tasks.md body.
 * Returns an array of { taskIndex, gatePath } in task order (1-based).
 */
function parseTaskGates(tasksMdBody: string): ReadonlyArray<{ taskIndex: number; gatePath: string }> {
	const lines = tasksMdBody.split("\n");
	const result: Array<{ taskIndex: number; gatePath: string }> = [];
	let taskIndex = 0;
	let inTask = false;

	for (const line of lines) {
		const taskMatch = line.match(/^- \[[ x]\]\s+\d+\./);
		if (taskMatch) {
			taskIndex += 1;
			inTask = true;
			continue;
		}
		if (inTask) {
			const gateMatch = line.match(/^\s+-\s+gate:\s*(.+)$/);
			if (gateMatch) {
				const gatePath = gateMatch[1].trim();
				if (gatePath.length > 0) {
					result.push({ taskIndex, gatePath });
				}
			}
		}
	}
	return result;
}

/**
 * Pure function — no I/O beyond the filesystem path passed in.
 * Does NOT call process.cwd() internally.
 *
 * Searches all active specs under `repoRoot/specs/active/` for a task whose
 * `gate:` field matches `filePath`. If found, checks whether the per-slice
 * sentinel `.gate-frozen-<N>` exists in that spec's directory.
 *
 * Returns:
 *   null                         — no task gate matches filePath
 *   { taskIndex, frozen: false } — matched task N, sentinel absent
 *   { taskIndex, frozen: true }  — matched task N, sentinel present
 */
export function findSliceForPath({
	filePath,
	repoRoot,
}: {
	readonly filePath: string;
	readonly repoRoot: string;
}): { readonly taskIndex: number; readonly frozen: boolean } | null {
	const activeDir = join(repoRoot, "specs", "active");
	if (!existsSync(activeDir)) return null;

	const absTarget = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
	const relTarget = absTarget.startsWith(`${repoRoot}/`)
		? absTarget.slice(repoRoot.length + 1)
		: absTarget;

	for (const slug of readdirSync(activeDir)) {
		if (slug.startsWith("_") || slug.startsWith(".")) continue;
		const specDir = join(activeDir, slug);
		const tasksPath = join(specDir, "tasks.md");
		if (!existsSync(tasksPath)) continue;

		const tasksMdBody = readFileSync(tasksPath, "utf-8");
		const taskGates = parseTaskGates(tasksMdBody);

		for (const { taskIndex, gatePath } of taskGates) {
			if (gatePath === relTarget || gatePath === absTarget) {
				const sentinel = join(specDir, `.gate-frozen-${taskIndex}`);
				const frozen = existsSync(sentinel);
				return { taskIndex, frozen };
			}
		}
	}
	return null;
}

function enforce(event: ToolEvent): void {
	const filePath = event.tool_input.file_path as string | undefined;
	if (!filePath) return;

	const repoRoot = findRepoRoot(filePath, event.cwd);
	const slice = findSliceForPath({ filePath, repoRoot });
	if (slice?.frozen) {
		block(
			event,
			`spec gate for task ${slice.taskIndex} is frozen (.gate-frozen-${slice.taskIndex} exists); edits to this gate path are not allowed.`,
			filePath,
		);
	}

	if (filePath.includes("/packages/api-contract/")) {
		block(
			event,
			"packages/api-contract is auto-derived from backend AppType — never edit it manually. Change the backend routes instead.",
			filePath,
		);
	}

	if (filePath.endsWith("apps/backend/wrangler.toml") || filePath.endsWith("/wrangler.toml")) {
		if (!activeSpecTargetsFile(event.cwd, "apps/backend/wrangler.toml")) {
			block(
				event,
				"apps/backend/wrangler.toml is a protected file. Create an active spec that targets it before editing.",
				filePath,
			);
		}
		return;
	}

	if (filePath.includes("/specs/archive/")) {
		block(
			event,
			"Archived specs are immutable. Create a new spec that supersedes the previous one.",
			filePath,
		);
	}
}

export function enforcePreToolUse(event: ToolEvent): void {
	try {
		enforce(event);
	} catch (err) {
		if (err instanceof Error && err.name === "BlockError") {
			process.exit(2);
		}
		const reason = err instanceof Error ? err.message : String(err);
		console.error(`enforcePreToolUse failed closed: ${reason}`);
		process.exit(2);
	}
}
