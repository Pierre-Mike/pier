/**
 * Structural invariants for @pier/api-contract.
 *
 * Cycle 1: api-contract only has allowed runtime dependencies
 * Cycle 2: cast isolation — `as unknown as` never appears in apps/frontend/
 * Cycle 3 (spec 009): findCastViolations skips *.test.ts and *.test.tsx files
 */
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findCastViolations, hasOnlyAllowedDeps } from "./invariants";

const REPO_ROOT = resolve(import.meta.dir, "../../../");

// --- Cycle 1: api-contract only has allowed runtime dependencies ---
describe("api-contract: allowed runtime dependencies", () => {
	it("only permits @pier/backend and hono as dependencies", () => {
		const pkgPath = join(REPO_ROOT, "packages/api-contract/package.json");
		expect(
			hasOnlyAllowedDeps(pkgPath),
			"api-contract must only depend on @pier/backend and hono",
		).toBe(true);
	});
});

// --- Cycle 2: cast isolation — `as unknown as` only in api-contract/src/index.ts ---
describe("frontend: no `as unknown as` casts", () => {
	it("no file in apps/frontend/ contains `as unknown as`", () => {
		const frontendSrc = join(REPO_ROOT, "apps/frontend");
		const violations = findCastViolations(frontendSrc, REPO_ROOT);
		expect(
			violations,
			`Cast 'as unknown as' must only appear in packages/api-contract/src/index.ts, not in apps/frontend/. Found in: ${violations.join(", ")}`,
		).toEqual([]);
	});
});

// --- Cycle 3 (spec 009): findCastViolations skips *.test.ts and *.test.tsx ---
describe("findCastViolations skips *.test.ts and *.test.tsx files", () => {
	const tmp = mkdtempSync(join(tmpdir(), "invariants-009-"));

	afterAll(() => {
		rmSync(tmp, { recursive: true });
	});

	it("returns only non-test files with as unknown as", () => {
		// clean.ts — no violation
		writeFileSync(join(tmp, "clean.ts"), "export const x = 1;\n");
		// bad.ts — has violation, should be flagged
		writeFileSync(join(tmp, "bad.ts"), "const y = {} as unknown as string;\n");
		// bad.test.ts — has violation, should be SKIPPED
		writeFileSync(join(tmp, "bad.test.ts"), "const a = {} as unknown as string;\n");
		// bad.test.tsx — has violation, should be SKIPPED
		writeFileSync(join(tmp, "bad.test.tsx"), "const b = {} as unknown as string;\n");

		const violations = findCastViolations(tmp, "");

		expect(
			violations.length,
			`Expected exactly 1 violation but got ${violations.length}: ${violations.join(", ")}`,
		).toBe(1);

		expect(
			violations.some((v) => v.endsWith("bad.ts")),
			"bad.ts must be flagged",
		).toBe(true);

		expect(
			violations.some((v) => v.endsWith("bad.test.ts")),
			"bad.test.ts must be skipped",
		).toBe(false);

		expect(
			violations.some((v) => v.endsWith("bad.test.tsx")),
			"bad.test.tsx must be skipped",
		).toBe(false);
	});
});
