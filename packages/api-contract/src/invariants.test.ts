/**
 * Structural invariants for @pier/api-contract.
 *
 * Cycle 1: api-contract only has allowed runtime dependencies
 * Cycle 2: cast isolation — `as unknown as` never appears in apps/frontend/
 */
import { describe, expect, it } from "bun:test";
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
