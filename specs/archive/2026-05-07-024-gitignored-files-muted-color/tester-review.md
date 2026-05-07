# Tester review — 024 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC1 → `assertHasIgnored` helper + "makeRepoServiceLive entries must have ignored: boolean" (backend unit) ✓
- AC2 → "listFiles returns all 3 entries" + "all returned entries have ignored as strict boolean" (backend unit) ✓
- AC3 → "ignored: true entry is returned with ignored === true" + "ignored: false entry is returned with ignored === false" (backend unit) ✓
- AC4 → "types.ts FileEntry interface includes ignored" (frontend integration) ✓
- AC5 → "files.ts references tree-file--ignored CSS class" + DOM test (frontend integration) ✓
- AC6 → "ignored file gets tree-file--ignored class; non-ignored does not" — DOM test asserts `ignoredItems.length === 1` when 1 of 2 entries is ignored ✓

### 2. Adversarial gap
YES — gap identified and acceptable given repo architecture.

An implementer could set `ignored: false` hardcoded for all entries in `makeRepoServiceLive` (never running `git ls-files -i`). The test layer tests would pass because they use fixture data with `ignored` pre-set. The live git detection would be unverified.

However: this is the established pattern in this repo — all backend unit tests use the test layer exclusively; the live `makeRepoServiceLive` is never unit-tested against a real git subprocess. The adversarial gap is bounded by the repo's test architecture contract, not a spec 024 authoring failure. The frontend integration tests provide a second layer of assurance that the rendered CSS class appears correctly.

### 3. Coverage gap
NO — within the test-layer unit-testing pattern used throughout this repo.

The live git annotation behavior (AC1 runtime for `makeRepoServiceLive`) is not exercised. This is consistent with how `projects.repo.test.ts`, `projects.refs.repo.test.ts`, and all other backend tests in this codebase operate. An explicit decision to NOT require a real git repo in unit tests is the repo's established norm.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.

- Source-text assertions on `"tree-file--ignored"` check the observable CSS class name, which IS the user-visible behavior. The class name is not an internal function name or library-specific string.
- DOM test asserts `querySelectorAll(".tree-file--ignored").length === 1` — pure observable DOM behavior.
- Backend assertions use property access on returned values, not internal function names or module structure.

## Verdict summary

PASS. All 6 acceptance criteria have at least one corresponding test. The adversarial gap (hardcoded `ignored: false` in live impl) is real but inherent to this repo's test-layer-only unit testing pattern — consistent with every other backend spec. Frontend integration tests pin the rendered output to the observable DOM class. Tests are behavior-pinned throughout.
