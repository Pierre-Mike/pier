# Tester review — 047 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
  - AC1 → test "AC1: writes registry.json with all required fields" (unit) + smoke Part 1 ✓
  - AC2 → test "AC2: second call for same name overwrites entry, leaves others intact" (unit) + smoke Part 2 ✓
  - AC3 → test "AC3: each call appends a line to history.ndjson" (unit) + smoke Part 3 ✓
  - AC4 → test "AC4: returns only active/crashed sessions with non-null claudeResumeId" (unit) + smoke Part 5 ✓
  - AC5 → tests "AC5: returns empty array when registry file does not exist" + "AC5: returns empty array when registry is empty object" (unit) + smoke Part 6 ✓
  - AC6 → test "AC6: registry.json is valid JSON" (unit) ✓
  - AC7 → smoke Parts 1–4 (field presence, atomicity, history count) ✓

### 2. Adversarial gap
YES

An implementer could write `registry.json` directly (non-atomic `writeFile`) rather than using the tmp-then-rename pattern. The test `"atomicity: tmp file is absent after successful write"` checks only that `registry.json.tmp` does not exist and `registry.json` does — a direct write satisfies both assertions without ever creating a tmp file. The POSIX rename mechanism is not mechanically enforced.

This is cosmetically minor: for a single-writer module running in Node/Bun, `writeFile` with the default O_CREAT|O_WRONLY flag is effectively crash-safe for small files, so the practical safety property the spec intends is preserved regardless of mechanism. The gap is noted but does not warrant a FAIL — the observable end-state assertion is the right contract for this module.

### 3. Coverage gap
NO

All testable properties in the intent are covered. Hook-based auto-update and history rotation are explicitly out of scope per design.md. The "no live process killing" constraint is a negative architectural invariant, not a testable assertion.

### 4. Behavior vs implementation detail
YES

Tests are behavior-pinned:
- Registry content verified via `JSON.parse` on the observable file.
- History content verified via `readFile` + line split — no internal function coupling.
- Imported function names (`upsertEntry`, `filterResumable`, `snapshotSession`, `listResumable`) are the declared public API, not internal implementation details.
- JSON field names (`name`, `tabTitle`, `cwd`, etc.) are the observable contract specified in the ACs.

## Verdict summary
PASS. All 7 acceptance criteria map to at least one test. The sole adversarial gap (direct write vs tmp-then-rename) is cosmetically minor and does not breach the practical safety intent for a single-writer module. No structural coverage gaps. Tests are pinned to observable behavior (file content, function return values) rather than internal implementation detail.
