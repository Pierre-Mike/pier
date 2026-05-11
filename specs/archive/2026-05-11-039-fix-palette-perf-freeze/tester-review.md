# Tester review — 039 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage

YES

Mapping:
- AC1 (`getEntries("")` under 16ms) → test "spec 039 — AC1: selectRowAt reuses cached entries" ✓
  (mapped via behavioral proxy: call-count constraint is stronger than timing constraint)
- AC2 (`getEntries("query")` under 16ms) → smoke Check 3 (getStore called once per getEntries) ✓
- AC3 (cache hit avoids redundant work) → test "spec 039 — AC3: repeated getEntries calls..." ✓
- AC4 (cache invalidation) → test "spec 039 — AC2/AC5: cache invalidation" ✓
- AC5 (spec 010 ACs remain passing) → implied by 25 pre-existing tests still in the gate file ✓
  (no explicit "spec 010 ACs pass" assertion, but all 25 tests run as part of the gate)
- AC6 (e2e smoke exits 0) → smoke-039-palette-perf.ts with 3 behavioral checks ✓

Note: AC1/AC2/AC6 in the proposal describe timing requirements (< 16ms), but the tests use call-count assertions. This is acceptable — preventing redundant `getStore` calls is the mechanism by which the timing goal is achieved, and call-count assertions are stronger (they catch the root cause, not just the symptom).

### 2. Adversarial gap

NO — searched, found none that are structurally exploitable.

Minor: The unit AC1 test does not assert that `selectProject` was actually called after `selectRowAt(0)`. An implementation could satisfy `callsForSelectRowAt === 0` by skipping the `selectProject` call entirely. However, the smoke script (Check 1) asserts `selectedId === "p1"`, closing this gap end-to-end. The two gates together enforce the full contract.

### 3. Coverage gap

NO

The only gap identified — explicit < 16ms timing assertion for a 500-project/2000-file store — is a symptom-level check (timing is environment-dependent). The call-count assertions cover the root cause deterministically. This is the better test.

AC5 (spec 010 tests remain passing) relies on the existing 25 tests running in the same gate file rather than an explicit sentinel. This is acceptable: the gate file IS palette.test.ts which includes both spec 010 and spec 039 tests — if spec 010 tests regress, the gate fails.

### 4. Behavior vs implementation detail

YES — tests are behavior-pinned.

`expect(callsForSelectRowAt).toBe(0)` tests an observable side effect of `getStore` (external state reads), not an internal function call. `getStore` is a user-provided dependency injected via `PaletteDeps`; its call count is observable to the caller. This is not implementation-detail coupling.

The comment in AC3 test is honest about what it can/cannot assert: it observes call count ≤5 for 5 cache-hit calls, and acknowledges the stronger property (no rebuild) is proved by AC1.

## Verdict summary

PASS. The gate has one genuinely failing test (AC1 unit: `callsForSelectRowAt` expected 0, got 1) and one failing smoke script (Check 1: same assertion at e2e level). Both targets encode the behavioral contract for the caching fix. All spec 010 tests remain in the gate and will regress if the fix breaks backward compatibility. The adversarial gap from the unit AC1 test (no assertion on selectProject call) is closed by the smoke gate. The coverage is sufficient for the implementer to proceed.
