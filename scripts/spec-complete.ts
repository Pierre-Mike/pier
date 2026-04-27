// @no-test: integration CLI; exercises real git and filesystem state
/**
 * Deterministic closer for an active spec.
 *
 *   1. Verify the spec's gate is green (tasks-verify)
 *   2. Tick every unchecked task whose file_targets exist and are modified in git
 *   3. Run spec-archive (self-gates: refuses unless all boxes ticked + gates green)
 *   4. Stage + commit the archive move with a conventional message
 *
 * No LLM, no guessing. Refuses on any precondition failure and prints why.
 */

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { loadSpec, taskGates } from "./_lib";

interface TaskLine {
	index: number;
	raw: string;
	checked: boolean;
	title: string;
	file_targets: string[];
	/** Ordinal task number (1-based), extracted from heading like "3." or "2a." */
	ordinal: number | undefined;
	/** Per-task gate path (slice-RED model) */
	gate: string | undefined;
}

const REPO_ROOT = process.cwd();

/**
 * Resolve a spec directory from either a full id-slug (`002-evals-importance`)
 * or a bare slug (`evals-importance`). Suffix-match only; ambiguous slugs
 * return null.
 */
export function resolveSpec(arg: string, root: string = REPO_ROOT): string | null {
	const activeDir = join(root, "specs", "active");
	if (!existsSync(activeDir)) return null;
	const direct = join(activeDir, arg);
	if (existsSync(join(direct, "proposal.md"))) return direct;
	const suffix = `-${arg}`;
	const matches = readdirSync(activeDir).filter((name) => {
		if (name.startsWith("_") || name.startsWith(".")) return false;
		if (!name.endsWith(suffix)) return false;
		return existsSync(join(activeDir, name, "proposal.md"));
	});
	if (matches.length === 1) {
		const only = matches[0];
		if (!only) return null;
		return join(activeDir, only);
	}
	return null;
}

async function sh(
	cmd: string[],
	opts: { silent?: boolean } = {},
): Promise<{ ok: boolean; out: string }> {
	const proc = Bun.spawn(cmd, {
		stdout: opts.silent ? "pipe" : "inherit",
		stderr: opts.silent ? "pipe" : "inherit",
	});
	const out = opts.silent ? await new Response(proc.stdout).text() : "";
	const code = await proc.exited;
	return { ok: code === 0, out };
}

function parseTasks(tasksMdPath: string): TaskLine[] {
	if (!existsSync(tasksMdPath)) return [];
	const lines = readFileSync(tasksMdPath, "utf-8").split("\n");
	const tasks: TaskLine[] = [];
	let current: TaskLine | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const taskMatch = line.match(/^- \[( |x)\]\s+(.+)$/);
		if (taskMatch) {
			if (current) tasks.push(current);
			const titleFull = taskMatch[2] ?? "";
			const ordinalMatch = titleFull.match(/^(\d+)[a-z]*\./);
			current = {
				index: i,
				raw: line,
				checked: taskMatch[1] === "x",
				title: titleFull,
				file_targets: [],
				ordinal: ordinalMatch ? parseInt(ordinalMatch[1] ?? "0", 10) : undefined,
				gate: undefined,
			};
			continue;
		}
		if (current) {
			const ft = line.match(/^\s+-\s+file_targets:\s*\[(.*)\]$/);
			if (ft) {
				current.file_targets = (ft[1] ?? "")
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
				continue;
			}
			const gm = line.match(/^\s+-\s+gate:\s*(.+)$/);
			if (gm) {
				current.gate = gm[1].trim();
			}
		}
	}
	if (current) tasks.push(current);
	return tasks;
}

async function gitModifiedSince(ref: string, paths: string[]): Promise<Set<string>> {
	if (paths.length === 0) return new Set();
	const { out } = await sh(["git", "diff", "--name-only", ref, "HEAD", "--", ...paths], {
		silent: true,
	});
	return new Set(out.split("\n").filter(Boolean));
}

async function specCreationRef(specDir: string): Promise<string> {
	const { out } = await sh(
		["git", "log", "--diff-filter=A", "--format=%H", "--", `${specDir}/proposal.md`],
		{ silent: true },
	);
	const shas = out.split("\n").filter(Boolean);
	const creationSha = shas[shas.length - 1];
	if (!creationSha) {
		// Spec not yet committed — compare against empty tree
		return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
	}
	return `${creationSha}^`;
}

function rewriteTaskLine(raw: string): string {
	return raw.replace(/^- \[ \]/, "- [x]");
}

async function main(): Promise<void> {
	const arg = process.argv[2];
	if (!arg) {
		console.error("usage: bun scripts/spec-complete.ts <slug>");
		process.exit(1);
	}

	const specDir = resolveSpec(arg);
	if (!specDir) {
		console.error(`✖ no active spec matching '${arg}' (tried exact and suffix-match)`);
		process.exit(1);
	}
	const slug = basename(specDir);
	const spec = loadSpec(specDir);
	if (!spec) {
		console.error(`✖ spec at specs/active/${slug} is missing a valid proposal.md`);
		process.exit(1);
	}

	console.log(`→ closing spec ${spec.frontmatter.id}`);

	// 0. Precondition: all per-task sentinels must exist (slice-RED model).
	// For backward compatibility, a bare .gate-frozen (old model) satisfies
	// this check — treat it as "all slices frozen."
	const slices = taskGates(specDir);
	const legacySentinel = join(specDir, ".gate-frozen");
	if (slices.length > 0) {
		const missingSentinels: number[] = [];
		for (const slice of slices) {
			if (!slice.frozen) {
				missingSentinels.push(slice.taskIndex);
			}
		}
		if (missingSentinels.length > 0) {
			console.error(
				`✖ missing .gate-frozen-<N> sentinel(s) for task(s): ${missingSentinels.join(", ")}`,
			);
			console.error("  All slices must be judged and frozen before spec:complete can run.");
			process.exit(1);
		}
	} else if (!existsSync(legacySentinel)) {
		// No per-task gates and no legacy sentinel — spec was never judged
		console.error("✖ spec has no frozen gate sentinels. Refusing to close.");
		process.exit(1);
	}

	// 1. Gate must be green
	console.log("\n[1/4] verifying gate…");
	const tasksVerifyScript = join(import.meta.dir, "tasks-verify.ts");
	const verify = await sh(["bun", tasksVerifyScript]);
	if (!verify.ok) {
		console.error("✖ gate is not green. Refusing to close.");
		process.exit(1);
	}

	// 2. Tick tasks whose file_targets were modified since spec creation
	console.log("\n[2/4] ticking completed tasks…");
	const tasksPath = join(specDir, "tasks.md");
	const tasks = parseTasks(tasksPath);
	const sinceRef = await specCreationRef(`specs/active/${slug}`);
	const lines = readFileSync(tasksPath, "utf-8").split("\n");
	let anyTicked = false;

	for (const task of tasks) {
		if (task.checked) continue;

		// Slice-RED: tick a task if its per-slice sentinel exists (gate was judged and is now green).
		if (task.gate !== undefined && task.ordinal !== undefined) {
			const sentinel = join(specDir, `.gate-frozen-${task.ordinal}`);
			if (existsSync(sentinel)) {
				lines[task.index] = rewriteTaskLine(task.raw);
				anyTicked = true;
				console.log(`  [tick] ${task.title.slice(0, 60)} (slice sentinel present)`);
				continue;
			}
		}

		// Legacy / file-targets path: tick when all file_targets exist and are modified since spec creation.
		if (task.file_targets.length === 0) {
			console.log(`  [skip] task "${task.title.slice(0, 60)}" — no file_targets declared`);
			continue;
		}
		const modified = await gitModifiedSince(sinceRef, task.file_targets);
		const allPresent = task.file_targets.every((f) => existsSync(join(REPO_ROOT, f)));
		const allModified = task.file_targets.every((f) => modified.has(f));
		if (allPresent && allModified) {
			lines[task.index] = rewriteTaskLine(task.raw);
			anyTicked = true;
			console.log(`  [tick] ${task.title.slice(0, 60)}`);
		} else {
			const reason = !allPresent
				? "file_targets missing on disk"
				: "file_targets not modified since spec creation";
			console.log(`  [skip] ${task.title.slice(0, 60)} — ${reason}`);
		}
	}

	if (anyTicked) writeFileSync(tasksPath, lines.join("\n"));

	// Refuse if any unchecked remain
	const stillUnchecked = parseTasks(tasksPath).filter((t) => !t.checked);
	if (stillUnchecked.length > 0) {
		console.error(`\n✖ ${stillUnchecked.length} task(s) still unchecked — cannot archive.`);
		for (const t of stillUnchecked) console.error(`    - ${t.title}`);
		process.exit(1);
	}

	// 3. Archive the spec directory
	console.log("\n[3/4] archiving…");
	const today = new Date().toISOString().slice(0, 10);
	const archiveParent = join(REPO_ROOT, "specs", "archive");
	if (!existsSync(archiveParent)) {
		// Ensure archive dir exists (may not in smoke repos)
		const { mkdirSync } = await import("node:fs");
		mkdirSync(archiveParent, { recursive: true });
	}
	const archiveDest = join(archiveParent, `${today}-${slug}`);
	renameSync(specDir, archiveDest);

	// Update proposal.md status to "archived"
	const proposalInArchive = join(archiveDest, "proposal.md");
	const rawProposal = readFileSync(proposalInArchive, "utf-8");
	const parsed = matter(rawProposal);
	parsed.data.status = "archived";
	parsed.data.archived = today;
	writeFileSync(proposalInArchive, matter.stringify(parsed.content, parsed.data));

	console.log(`✓ archived ${slug} → specs/archive/${today}-${slug}`);

	// 4. Commit the archive move
	console.log("\n[4/4] committing…");
	const kind = spec.frontmatter.kind;
	const prefix =
		kind === "writeup" ? "post" : kind === "rule" ? "rule" : kind === "workflow" ? "ci" : "feat";
	const title = spec.frontmatter.title || spec.frontmatter.id;
	const commitMsg = `${prefix}(${spec.frontmatter.id}): ${title}\n\nSpec archived to specs/archive/ per deterministic close.`;

	const addResult = await sh(["git", "add", "-A"]);
	if (!addResult.ok) {
		console.error("✖ git add failed");
		process.exit(1);
	}
	const commit = await sh(["git", "commit", "-m", commitMsg]);
	if (!commit.ok) {
		console.error("✖ git commit failed (hook rejected or nothing to commit?)");
		process.exit(1);
	}

	console.log(
		`\n✓ spec ${spec.frontmatter.id} closed and committed. Push when ready:\n    git push`,
	);
}

if (import.meta.main) {
	await main();
}
