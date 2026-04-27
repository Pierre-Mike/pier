/**
 * Validates every spec's frontmatter, detects cycles in depends_on, and
 * schema-checks each active spec's tasks.md. Exports pure helpers used by
 * `scripts/tasks-verify.ts` and the colocated `spec-lint.test.ts`.
 *
 * Exports:
 *  - validateBoundary({ task, changedFiles, repoRoot }) — union-semantics
 *    glob matcher. Returns {ok:true} or {ok:false, offendingFiles:[...]}.
 *  - validateTaskSchema(task) — shape checker for parsed tasks.md entries.
 *  - parseTasksFile(path) — parser shared with tasks-verify.ts.
 *
 * CLI entrypoint exits non-zero on any schema error (warnings only log).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gateEntries, listActiveSpecs, listArchivedIds, VALID_KINDS } from "./_lib";

export interface ParsedTask {
	readonly index: number;
	readonly title: string;
	readonly file_targets: readonly string[];
	readonly boundary?: readonly string[] | undefined;
}

export interface SchemaReport {
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
}

export type BoundaryResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly offendingFiles: readonly string[] };

/**
 * Glob-match each changed file against any of the task's boundary globs.
 * Union semantics: a file passes if ANY glob matches. The special escape
 * hatch `"*"` is expanded to `"**"` so it genuinely matches any path
 * (not just a single segment).
 *
 * Pure — no IO. `repoRoot` is accepted for future-proofing (absolute-path
 * normalization) but not currently used.
 */
export function validateBoundary({
	task,
	changedFiles,
	repoRoot: _repoRoot,
}: {
	readonly task: { readonly boundary?: readonly string[] | undefined };
	readonly changedFiles: readonly string[];
	readonly repoRoot: string;
}): BoundaryResult {
	if (task.boundary === undefined) return { ok: true };
	const patterns = task.boundary.map((g) => (g === "*" ? "**" : g));
	const globs = patterns.map((p) => new Bun.Glob(p));
	const offenders: string[] = [];
	for (const file of changedFiles) {
		const allowed = globs.some((g) => g.match(file));
		if (!allowed) offenders.push(file);
	}
	if (offenders.length === 0) return { ok: true };
	return { ok: false, offendingFiles: offenders };
}

/**
 * Shape-check a parsed task entry. Errors are hard failures; warnings are
 * non-blocking diagnostics (used for the backward-compat "missing boundary"
 * case so pre-existing specs don't break).
 */
export function validateTaskSchema(task: ParsedTask): SchemaReport {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (task.boundary === undefined) {
		warnings.push(
			`task ${task.index} "${task.title.slice(0, 60)}": missing \`boundary:\` — add an explicit glob list (deprecation; will become an error in a future spec)`,
		);
		return { errors, warnings };
	}

	if (!Array.isArray(task.boundary)) {
		errors.push(
			`task ${task.index} "${task.title.slice(0, 60)}": \`boundary\` must be an array of strings`,
		);
		return { errors, warnings };
	}

	for (const item of task.boundary) {
		if (typeof item !== "string") {
			errors.push(
				`task ${task.index} "${task.title.slice(0, 60)}": \`boundary\` must be an array of strings (got ${typeof item})`,
			);
			return { errors, warnings };
		}
	}

	if (task.boundary.length === 0) {
		warnings.push(
			`task ${task.index} "${task.title.slice(0, 60)}": empty \`boundary\` — did you mean \`["*"]\`? An empty array denies every file.`,
		);
	}

	return { errors, warnings };
}

/**
 * Detect duplicate spec IDs across a union of active and archive slugs.
 *
 * `slugs` is a flat list of normalised slug strings — active folder basenames
 * (e.g. "033-spec-lint-duplicate-ids") and archive folder basenames with the
 * date prefix already stripped (e.g. "030-retro-dormant-worktrees").
 *
 * Groups by leading \d+ and emits one error per colliding NNN:
 *   "duplicate spec id NNN: slug-a, slug-b"
 *
 * Pure — no IO.
 */
export function detectDuplicateIds(slugs: readonly string[]): { errors: string[] } {
	const byId = new Map<string, string[]>();
	for (const slug of slugs) {
		const match = slug.match(/^(\d+)/);
		if (!match) continue;
		const nnn = match[1] ?? "";
		const existing = byId.get(nnn) ?? [];
		existing.push(slug);
		byId.set(nnn, existing);
	}
	const errors: string[] = [];
	for (const [nnn, owners] of byId) {
		if (owners.length > 1) {
			errors.push(`duplicate spec id ${nnn}: ${owners.join(", ")}`);
		}
	}
	return { errors };
}

/**
 * Validate that a kind:code spec has ≥1 unit entry AND ≥1 integration|e2e entry.
 * Non-code kinds are not subject to level enforcement.
 *
 * Pure — no IO.
 */
export function validateGateLevels({
	kind,
	entries,
}: {
	readonly kind: string;
	readonly entries: readonly { path: string; level: string }[];
}): { errors: string[] } {
	if (kind !== "code") return { errors: [] };
	const levels = entries.map((e) => e.level);
	const hasUnit = levels.includes("unit");
	const hasIntegrationOrE2E = levels.some((l) => l === "integration" || l === "e2e");
	if (!hasUnit || !hasIntegrationOrE2E) {
		return {
			errors: [`kind=code requires ≥1 unit + ≥1 integration|e2e gate; got [${levels.join(", ")}]`],
		};
	}
	return { errors: [] };
}

/**
 * Parse a tasks.md file into ParsedTask records. Matches spec-complete.ts's
 * parser but adds the `boundary:` line.
 */
export function parseTasksFile(path: string): readonly ParsedTask[] {
	if (!existsSync(path)) return [];
	const lines = readFileSync(path, "utf-8").split("\n");
	const tasks: ParsedTask[] = [];
	let current: {
		index: number;
		title: string;
		file_targets: string[];
		boundary: string[] | undefined;
	} | null = null;

	const parseBracketList = (raw: string): string[] =>
		raw
			.split(",")
			.map((s) => s.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const taskMatch = line.match(/^- \[( |x)\]\s+(.+)$/);
		if (taskMatch) {
			if (current)
				tasks.push({
					index: current.index,
					title: current.title,
					file_targets: current.file_targets,
					boundary: current.boundary,
				});
			current = {
				index: i,
				title: taskMatch[2] ?? "",
				file_targets: [],
				boundary: undefined,
			};
			continue;
		}
		if (!current) continue;
		const ft = line.match(/^\s+-\s+file_targets:\s*\[(.*)\]$/);
		if (ft) {
			current.file_targets = parseBracketList(ft[1] ?? "");
			continue;
		}
		const bd = line.match(/^\s+-\s+boundary:\s*\[(.*)\]$/);
		if (bd) {
			current.boundary = parseBracketList(bd[1] ?? "");
		}
	}
	if (current) {
		tasks.push({
			index: current.index,
			title: current.title,
			file_targets: current.file_targets,
			boundary: current.boundary,
		});
	}
	return tasks;
}

function main(): void {
	const errors: string[] = [];
	const warnings: string[] = [];
	const active = listActiveSpecs();
	const archivedIds = listArchivedIds();
	const allIds = new Set([...active.map((s) => s.frontmatter.id), ...archivedIds]);

	// Duplicate-ID check: union of active slugs + archive folder names (date prefix stripped)
	const archiveDir = join(process.cwd(), "specs", "archive");
	const archiveFolderNames: string[] = existsSync(archiveDir)
		? readdirSync(archiveDir).filter((n) => !n.startsWith("."))
		: [];
	const normalizedArchiveSlugs = archiveFolderNames.map((n) =>
		n.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
	);
	const activeSlugs = active.map((s) => s.slug);
	const duplicateReport = detectDuplicateIds([...activeSlugs, ...normalizedArchiveSlugs]);
	for (const e of duplicateReport.errors) errors.push(e);

	for (const spec of active) {
		const fm = spec.frontmatter;
		if (!VALID_KINDS.includes(fm.kind)) {
			errors.push(
				`${spec.slug}: invalid kind '${fm.kind}'. Expected one of ${VALID_KINDS.join(", ")}`,
			);
		}

		// gateEntries validation: invalid levels, duplicate paths, level coverage
		let entries: { path: string; level: string }[] = [];
		try {
			entries = [...gateEntries(spec)];
		} catch (err) {
			errors.push(`${spec.slug}: ${err instanceof Error ? err.message : String(err)}`);
		}

		for (const entry of entries) {
			if (!existsSync(join(process.cwd(), entry.path))) {
				errors.push(`${spec.slug}: gate artifact missing at ${entry.path}`);
			}
		}

		// Level coverage check for kind:code
		const levelReport = validateGateLevels({ kind: fm.kind, entries });
		for (const e of levelReport.errors) {
			errors.push(`${spec.slug}: ${e}`);
		}

		for (const dep of fm.depends_on) {
			if (!allIds.has(dep)) {
				errors.push(`${spec.slug}: depends_on references unknown spec '${dep}'`);
			}
		}

		// Tasks schema
		const tasksPath = join(spec.dir, "tasks.md");
		for (const task of parseTasksFile(tasksPath)) {
			const report = validateTaskSchema(task);
			for (const e of report.errors) errors.push(`${spec.slug}: ${e}`);
			for (const w of report.warnings) warnings.push(`${spec.slug}: ${w}`);
		}
	}

	// Cycle detection
	const graph = new Map<string, string[]>();
	for (const spec of active) {
		graph.set(spec.frontmatter.id, spec.frontmatter.depends_on);
	}
	const visited = new Set<string>();
	const stack = new Set<string>();
	function visit(id: string, path: string[]): void {
		if (stack.has(id)) {
			errors.push(`cycle detected: ${[...path, id].join(" → ")}`);
			return;
		}
		if (visited.has(id)) return;
		stack.add(id);
		for (const dep of graph.get(id) ?? []) visit(dep, [...path, id]);
		stack.delete(id);
		visited.add(id);
	}
	for (const id of graph.keys()) visit(id, []);

	for (const w of warnings) console.warn(`⚠ ${w}`);
	if (errors.length > 0) {
		for (const e of errors) console.error(`✖ ${e}`);
		process.exit(1);
	}
	console.log(`✓ ${active.length} active spec(s) valid.`);
}

if (import.meta.main) {
	main();
}
