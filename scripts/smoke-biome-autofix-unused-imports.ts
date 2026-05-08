#!/usr/bin/env bun

// smoke-biome-autofix-unused-imports.ts
// spec 031 workflow gate: prove that biome.json marks `noUnusedImports`
// as a safe-fix rule, AND that `bunx biome check --write` (no --unsafe)
// auto-removes a leftover unused import. Hermetic.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const BIOME_JSON = join(REPO_ROOT, "biome.json");

// ---------- Part 1: snapshot contract on biome.json ----------
// `noUnusedImports` must be declared as an object with `fix: "safe"` so
// `--write` (the existing pre-commit invocation) auto-applies the fix.
interface RuleSpec {
	readonly level?: string;
	readonly fix?: string;
}
interface BiomeConfig {
	readonly linter?: {
		readonly rules?: {
			readonly correctness?: {
				readonly noUnusedImports?: string | RuleSpec;
			};
		};
	};
}
const biome = JSON.parse(readFileSync(BIOME_JSON, "utf8")) as BiomeConfig;
const rule = biome.linter?.rules?.correctness?.noUnusedImports;

if (typeof rule === "string" || !rule || rule.fix !== "safe") {
	console.error(
		`FAIL contract: biome.json correctness.noUnusedImports must be \`{ "level": "error", "fix": "safe" }\``,
	);
	console.error(`  current: ${JSON.stringify(rule)}`);
	process.exit(1);
}

// ---------- Part 2: behavioural experiment ----------
// Spawn biome against a tmp file with a leftover unused import. Assert the
// import is removed AND biome exits 0. Run from REPO_ROOT so biome.json is
// the same one the contract layer just validated.
const tmp = mkdtempSync(join(tmpdir(), "smoke-031-"));
const fixture = join(tmp, "fixture.ts");
const original = `import { join } from "node:path";\nexport const x = 1;\n`;
const expected = `export const x = 1;\n`;
writeFileSync(fixture, original);

const proc = Bun.spawn(["bunx", "biome", "check", "--write", "--no-errors-on-unmatched", fixture], {
	cwd: REPO_ROOT,
	stdout: "pipe",
	stderr: "pipe",
});
const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

const after = readFileSync(fixture, "utf8");
rmSync(tmp, { recursive: true, force: true });

if (code !== 0) {
	console.error(`FAIL experiment: biome exited ${code} (expected 0 — fix should auto-apply)`);
	console.error("stderr:", stderr);
	process.exit(1);
}

if (after !== expected) {
	console.error("FAIL experiment: biome did not remove the unused import");
	console.error("  before:");
	console.error(original);
	console.error("  expected after:");
	console.error(expected);
	console.error("  actual after:");
	console.error(after);
	process.exit(1);
}

console.log("smoke-031: PASS");
