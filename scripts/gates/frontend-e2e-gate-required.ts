/**
 * Gate for spec 043-require-frontend-e2e-gate (kind: rule).
 *
 * Verifies that `validateFrontendE2eGate` from scripts/spec-lint.ts:
 *   - returns errors for the fail-fixture (kind:code + frontend target + no e2e gate)
 *   - returns no errors for the pass-fixture (kind:code + frontend target + e2e gate present)
 *
 * Exits 0 on correct behaviour; throws (exit 1) on mismatch.
 * Run by `bun run tasks:verify` via runGateEntry.
 */

import { join } from "node:path";
import { loadSpec } from "../_lib";
// validateFrontendE2eGate is not yet implemented — this import will fail at runtime,
// keeping this gate in RED state until the implementer adds the export.
import { validateFrontendE2eGate } from "../spec-lint";

const FIXTURES = join(import.meta.dir, "fixtures", "frontend-e2e-gate-required");
const PASS_DIR = join(FIXTURES, "pass");
const FAIL_DIR = join(FIXTURES, "fail");

const passSpec = loadSpec(PASS_DIR);
const failSpec = loadSpec(FAIL_DIR);

if (!passSpec) throw new Error(`pass fixture missing at ${PASS_DIR}`);
if (!failSpec) throw new Error(`fail fixture missing at ${FAIL_DIR}`);

const passResult = validateFrontendE2eGate(passSpec);
const failResult = validateFrontendE2eGate(failSpec);

const EXPECTED_FAIL_MSG =
	"999-fail: kind:code touching apps/frontend/{pages,dashboard} must include an apps/e2e/tests/*.spec.ts gate entry";

// pass-fixture must produce zero errors
if (passResult.errors.length !== 0) {
	throw new Error(
		`pass-fixture: expected 0 errors, got ${passResult.errors.length}:\n  ${passResult.errors.join("\n  ")}`,
	);
}

// fail-fixture must produce ≥1 error containing the expected message
if (failResult.errors.length === 0) {
	throw new Error("fail-fixture: expected ≥1 error, got 0");
}

const found = failResult.errors.some((e) => e === EXPECTED_FAIL_MSG);
if (!found) {
	throw new Error(
		`fail-fixture: expected error message not found.\n  Expected: ${EXPECTED_FAIL_MSG}\n  Got: ${failResult.errors.join("\n  ")}`,
	);
}

console.log("✓ frontend-e2e-gate-required: all fixture assertions pass");
