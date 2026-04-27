/**
 * Unit tests for `findSliceForPath` — a new export from `enforce.ts`.
 * RED state: the function does not exist yet; the import will fail.
 *
 * Each test builds isolated fixture directories in os.tmpdir() so there is no
 * shared mutable state between cases.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
// This import will fail (RED) until the implementer adds the export.
import { findSliceForPath } from "./enforce";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "pier-test-"));
	mkdirSync(join(root, ".git"), { recursive: true });
	mkdirSync(join(root, "specs", "active"), { recursive: true });
	return root;
}

interface MakeSpecOpts {
	readonly repoRoot: string;
	readonly slug: string;
	readonly tasks: ReadonlyArray<{ readonly gate: string }>;
	readonly frozenSlices?: ReadonlyArray<number>;
}

function makeSpec({ repoRoot, slug, tasks, frozenSlices = [] }: MakeSpecOpts): void {
	const specDir = join(repoRoot, "specs", "active", slug);
	mkdirSync(specDir, { recursive: true });

	// Minimal proposal.md
	writeFileSync(
		join(specDir, "proposal.md"),
		`---\nid: "001"\ntitle: Test\nstatus: active\nkind: code\ncreated: 2026-01-01\n---\n`,
	);

	// tasks.md with per-task gate: field
	const lines: string[] = ["# Tasks\n"];
	for (let i = 0; i < tasks.length; i++) {
		const task = tasks[i];
		if (!task) continue;
		lines.push(`- [ ] ${i + 1}. Task ${i + 1}`);
		lines.push(`  - agent: main`);
		lines.push(`  - depends: []`);
		lines.push(`  - file_targets: [some/file.ts]`);
		lines.push(`  - boundary: [some/file.ts]`);
		lines.push(`  - gate: ${task.gate}`);
	}
	writeFileSync(join(specDir, "tasks.md"), lines.join("\n"));

	// Create sentinel files for frozen slices
	for (const n of frozenSlices) {
		writeFileSync(join(specDir, `.gate-frozen-${n}`), "");
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findSliceForPath", () => {
	test("returns null when specs/active directory does not exist", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "pier-test-"));
		mkdirSync(join(repoRoot, ".git"), { recursive: true });
		// No specs/active directory created

		const result = findSliceForPath({
			filePath: join(repoRoot, ".claude/hooks/enforce.test.ts"),
			repoRoot,
		});

		expect(result).toBeNull();
	});

	test("returns null when no active spec exists (empty active dir)", () => {
		const repoRoot = makeRepo();

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/smoke-foo.ts"),
			repoRoot,
		});

		expect(result).toBeNull();
	});

	test("returns null when file path matches no task gate field", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: ".claude/hooks/enforce.test.ts" },
				{ gate: "scripts/smoke-foo.ts" },
			],
		});

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/unrelated.ts"),
			repoRoot,
		});

		expect(result).toBeNull();
	});

	test("returns { taskIndex: 1, frozen: false } when path matches task 1 gate and .gate-frozen-1 absent", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: ".claude/hooks/enforce.test.ts" },
				{ gate: "scripts/smoke-foo.ts" },
			],
			frozenSlices: [],
		});

		const result = findSliceForPath({
			filePath: join(repoRoot, ".claude/hooks/enforce.test.ts"),
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 1, frozen: false });
	});

	test("returns { taskIndex: 1, frozen: true } when path matches task 1 gate and .gate-frozen-1 exists", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: ".claude/hooks/enforce.test.ts" },
				{ gate: "scripts/smoke-foo.ts" },
			],
			frozenSlices: [1],
		});

		const result = findSliceForPath({
			filePath: join(repoRoot, ".claude/hooks/enforce.test.ts"),
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 1, frozen: true });
	});

	test("returns { taskIndex: 2, frozen: false } when path matches task 2 gate and .gate-frozen-2 absent", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: ".claude/hooks/enforce.test.ts" },
				{ gate: "scripts/smoke-foo.ts" },
			],
			frozenSlices: [1], // only slice 1 frozen; slice 2 not yet frozen
		});

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/smoke-foo.ts"),
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 2, frozen: false });
	});

	test("returns { taskIndex: 2, frozen: true } when path matches task 2 gate and .gate-frozen-2 exists", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: ".claude/hooks/enforce.test.ts" },
				{ gate: "scripts/smoke-foo.ts" },
			],
			frozenSlices: [1, 2],
		});

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/smoke-foo.ts"),
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 2, frozen: true });
	});

	test("handles multiple active specs — returns match from correct spec", () => {
		const repoRoot = makeRepo();

		makeSpec({ repoRoot, slug: "001-alpha", tasks: [{ gate: "scripts/alpha-gate.test.ts" }] });
		makeSpec({
			repoRoot,
			slug: "002-beta",
			tasks: [{ gate: "scripts/beta-gate.test.ts" }],
			frozenSlices: [1],
		});

		// Path belongs to beta spec, which has its slice frozen
		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/beta-gate.test.ts"),
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 1, frozen: true });
	});

	test("handles multiple active specs — unrelated path returns null across all specs", () => {
		const repoRoot = makeRepo();

		makeSpec({ repoRoot, slug: "001-alpha", tasks: [{ gate: "scripts/alpha-gate.test.ts" }], frozenSlices: [1] });
		makeSpec({ repoRoot, slug: "002-beta", tasks: [{ gate: "scripts/beta-gate.test.ts" }], frozenSlices: [1] });

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/unrelated.ts"),
			repoRoot,
		});

		expect(result).toBeNull();
	});

	test("accepts relative filePath resolved against repoRoot — no process.cwd() dependency", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [{ gate: ".claude/hooks/enforce.test.ts" }],
			frozenSlices: [1],
		});

		// Pass a repo-relative path (not absolute)
		const result = findSliceForPath({
			filePath: ".claude/hooks/enforce.test.ts",
			repoRoot,
		});

		expect(result).toEqual({ taskIndex: 1, frozen: true });
	});

	test("skips spec dirs that are missing tasks.md", () => {
		const repoRoot = makeRepo();
		// Create a spec dir with only proposal.md, no tasks.md
		const specDir = join(repoRoot, "specs", "active", "001-no-tasks");
		mkdirSync(specDir, { recursive: true });
		writeFileSync(
			join(specDir, "proposal.md"),
			`---\nid: "001"\ntitle: No Tasks\nstatus: active\nkind: code\ncreated: 2026-01-01\n---\n`,
		);

		const result = findSliceForPath({
			filePath: join(repoRoot, "scripts/anything.ts"),
			repoRoot,
		});

		expect(result).toBeNull();
	});

	test("task index is 1-based and matches the ordinal position in tasks.md", () => {
		const repoRoot = makeRepo();
		makeSpec({
			repoRoot,
			slug: "001-test",
			tasks: [
				{ gate: "scripts/gate-a.test.ts" },
				{ gate: "scripts/gate-b.test.ts" },
				{ gate: "scripts/gate-c.test.ts" },
			],
			frozenSlices: [1, 2], // slices 1 and 2 frozen; slice 3 not
		});

		const thirdResult = findSliceForPath({
			filePath: join(repoRoot, "scripts/gate-c.test.ts"),
			repoRoot,
		});

		expect(thirdResult).toEqual({ taskIndex: 3, frozen: false });
	});
});
