#!/usr/bin/env bun

// smoke-do-fast-bundle.ts
// spec 027 workflow gate: assert the /do-fast skill bundle is present and
// has valid frontmatter. Hermetic — pure fs reads, no skill loading,
// no `claude` invocation.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");

interface BundleEntry {
	readonly path: string;
	readonly requiredKeys: readonly string[];
}

const BUNDLE: readonly BundleEntry[] = [
	{
		path: ".claude/skills/do-fast/SKILL.md",
		requiredKeys: ["name", "description"],
	},
	{
		path: ".claude/agents/do-fast-orchestrator.md",
		requiredKeys: ["name"],
	},
	{
		path: ".claude/agents/spec-fielder.md",
		requiredKeys: ["name"],
	},
];

function extractFrontmatter(source: string): string | null {
	if (!source.startsWith("---\n")) return null;
	const end = source.indexOf("\n---", 4);
	if (end < 0) return null;
	return source.slice(4, end);
}

function hasKey(frontmatter: string, key: string): boolean {
	// Match `key:` at line start with non-empty value (scalar or block).
	const re = new RegExp(`^${key}\\s*:\\s*\\S`, "m");
	return re.test(frontmatter);
}

let failed = 0;

for (const entry of BUNDLE) {
	const absPath = join(REPO_ROOT, entry.path);

	if (!existsSync(absPath)) {
		console.error(`FAIL ${entry.path}: missing`);
		failed += 1;
		continue;
	}

	const source = readFileSync(absPath, "utf8");
	const frontmatter = extractFrontmatter(source);

	if (frontmatter === null) {
		console.error(`FAIL ${entry.path}: missing or malformed frontmatter`);
		failed += 1;
		continue;
	}

	for (const key of entry.requiredKeys) {
		if (!hasKey(frontmatter, key)) {
			console.error(`FAIL ${entry.path}: frontmatter missing key "${key}"`);
			failed += 1;
		}
	}
}

if (failed > 0) {
	console.error(`smoke-027: ${failed} failure(s)`);
	process.exit(1);
}

console.log("smoke-027: PASS");
