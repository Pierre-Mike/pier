/**
 * Smoke / e2e gate for spec 009: Carve out test files from cast-violation scanner.
 *
 * Runs the invariants test suite and checks that the result for a directory
 * containing mixed test/non-test files returns exactly the expected violations.
 *
 * RED: exits 1 until findCastViolations is updated to skip *.test.ts / *.test.tsx.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

// Dynamically import the function under test from the worktree's build
const { findCastViolations } = await import(
	join(REPO_ROOT, "packages/api-contract/src/invariants.ts")
);

const tmp = mkdtempSync(join(tmpdir(), "smoke-009-"));
try {
	writeFileSync(join(tmp, "clean.ts"), "export const x = 1;\n");
	writeFileSync(join(tmp, "bad.ts"), "const y = {} as unknown as string;\n");
	writeFileSync(join(tmp, "bad.test.ts"), "const a = {} as unknown as string;\n");
	writeFileSync(join(tmp, "bad.test.tsx"), "const b = {} as unknown as string;\n");

	const violations: readonly string[] = findCastViolations(tmp, "");

	if (violations.length !== 1) {
		console.error(
			`[smoke-009] FAIL: expected 1 violation, got ${violations.length}: ${violations.join(", ")}`,
		);
		process.exit(1);
	}

	if (!violations.some((v: string) => v.endsWith("bad.ts"))) {
		console.error("[smoke-009] FAIL: bad.ts not flagged");
		process.exit(1);
	}

	if (violations.some((v: string) => v.endsWith("bad.test.ts"))) {
		console.error("[smoke-009] FAIL: bad.test.ts should be skipped but was flagged");
		process.exit(1);
	}

	if (violations.some((v: string) => v.endsWith("bad.test.tsx"))) {
		console.error("[smoke-009] FAIL: bad.test.tsx should be skipped but was flagged");
		process.exit(1);
	}

	console.log("[smoke-009] PASS: findCastViolations correctly skips test files");
} finally {
	rmSync(tmp, { recursive: true });
}
