/**
 * Deterministic transition: specs/active/NNN-slug → specs/archive/YYYY-MM-DD-NNN-slug.
 * Refuses to archive unless all tasks are checked and gates pass (via tasks-verify).
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { loadSpec } from "./_lib";

function hasUncheckedTasks(dir: string): boolean {
	const tasks = join(dir, "tasks.md");
	if (!existsSync(tasks)) return false;
	return /- \[ \]/.test(readFileSync(tasks, "utf-8"));
}

async function gatesPass(): Promise<boolean> {
	const proc = Bun.spawn(["bun", "scripts/tasks-verify.ts"], {
		stdout: "inherit",
		stderr: "inherit",
	});
	return (await proc.exited) === 0;
}

async function main(): Promise<void> {
	const slug = process.argv[2];
	if (!slug) {
		console.error("usage: bun scripts/spec-archive.ts <slug>");
		process.exit(1);
	}

	const activeDir = join(process.cwd(), "specs", "active", slug);
	const spec = loadSpec(activeDir);
	if (!spec) {
		console.error(`spec not found at specs/active/${slug}`);
		process.exit(1);
	}

	if (hasUncheckedTasks(activeDir)) {
		console.error("refusing to archive: tasks.md still has unchecked items.");
		process.exit(1);
	}

	if (!(await gatesPass())) {
		console.error("refusing to archive: gates did not pass.");
		process.exit(1);
	}

	const today = new Date().toISOString().slice(0, 10);
	const archiveDir = join(process.cwd(), "specs", "archive", `${today}-${slug}`);
	renameSync(activeDir, archiveDir);

	const proposalPath = join(archiveDir, "proposal.md");
	const raw = readFileSync(proposalPath, "utf-8");
	const parsed = matter(raw);
	parsed.data.status = "archived";
	parsed.data.archived = today;
	writeFileSync(proposalPath, matter.stringify(parsed.content, parsed.data));

	console.log(`✓ archived ${slug} → specs/archive/${today}-${slug}`);
}

await main();
