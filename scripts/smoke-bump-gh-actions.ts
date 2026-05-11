#!/usr/bin/env bun

// smoke-bump-gh-actions.ts
// spec 038 workflow gate: prove every uses: `actions/*@vN` reference in
// .github/workflows/*.yml is pinned at the required major, and that no
// stale deprecated versions remain.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const WF_DIR = join(REPO_ROOT, ".github", "workflows");

interface Rule {
	readonly action: string;
	readonly requiredMajor: number;
}

const RULES: readonly Rule[] = [
	{ action: "checkout", requiredMajor: 6 },
	{ action: "setup-node", requiredMajor: 6 },
	{ action: "cache", requiredMajor: 5 },
	{ action: "upload-artifact", requiredMajor: 7 },
];

const failures: string[] = [];

for (const file of readdirSync(WF_DIR).filter((f) => f.endsWith(".yml"))) {
	const path = join(WF_DIR, file);
	const lines = readFileSync(path, "utf8").split("\n");

	for (const [idx, raw] of lines.entries()) {
		// Match: `- uses: actions/<name>@<ref>` (anywhere on the line)
		const m = raw.match(/uses:\s*actions\/([a-z-]+)@v(\d+)/);
		if (!m) continue;
		const action = m[1];
		const major = Number(m[2]);
		const rule = RULES.find((r) => r.action === action);
		if (!rule) continue; // not one we govern

		if (major !== rule.requiredMajor) {
			failures.push(
				`${file}:${idx + 1} — actions/${action}@v${major} (must be @v${rule.requiredMajor})`,
			);
		}
	}
}

if (failures.length > 0) {
	for (const f of failures) {
		console.error(`FAIL: ${f}`);
	}
	process.exit(1);
}

console.log("✓ all governed GitHub Actions pinned at required majors");
