# Tester review — 058-fix-agents-schema-drift (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC 1 (live roster decode) → integration test `decodeRoster accepts the real ~/.claude/daemon/roster.json` (skipIf !rosterExists) ✓
  - AC 2 (fixture round-trip) → unit test `decodeRoster accepts roster.fixture.json` ✓
  - AC 3 (409 when absent, correct message) → integration test `returns 409 { error: "daemon not running" } when roster is null` ✓
  - AC 4 (502 when decode fails, with details) → integration test `returns 502 { error: "roster shape unrecognized — check CLI version", details: string }` ✓
  - AC 5 (200 AgentRow[] when valid) → integration test `returns 200 AgentRow[] when roster decodes successfully` ✓

### 2. Adversarial gap
NO — searched, found none.

Most plausible attack: implementer widens schema to fix AC 1/2 but skips `DaemonRosterUnreadable` split (keeps decode-Left → DaemonAbsent → 409). This is blocked by integration test (c) which expects status 502. Cannot pass without introducing the new error tag. The tests are correctly designed.

### 3. Coverage gap
NO — no untested testable properties.

Note: spec constraint "Spec 056 integration test must still pass" is a regression concern, not a new property. CI runs all tests; the existing integration test will catch regressions. Not a gate gap.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.
- HTTP status codes (409, 502, 200)
- Response body shapes (error string, details non-empty string, array)
- Schema decoder `_tag` return values

No internal function names, no Effect-specific error message strings, no implementation-detail coupling observed.

## Verdict summary
All 5 acceptance criteria map to at least one test. The adversarial gap analysis finds no exploit path. Coverage is complete. Tests are behavior-pinned. Gate is ready for implementation.
