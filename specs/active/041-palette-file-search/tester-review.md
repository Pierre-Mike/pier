# Tester review — 041 (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage
NO — three ACs have no test coverage.

Mapping:
  - AC1 → tests "searchFiles exists", "returns files whose path contains the query", "case-insensitive", "empty query returns empty array", "empty array for unknown project" ✓
  - AC2 → tests "respects limit: returns at most limit results", "limit=1 returns exactly one result" ✓
  - AC3 → tests "spec 041 AC3: empty query returns projects only" (two tests), "entry ordering" test ✓
  - AC4 → tests "PaletteDeps accepts fetchFileResults without type error", "notifyFileResults (or equivalent) exists" — PARTIAL: debounce and AbortController are not tested; fetchFileResults being actually CALLED is not verified
  - AC5 → test "after setSearchResults, file entries appear after project entries in getEntries" ✓ (conditional)
  - AC6 → tests "esc() clears searchResults", "empty query clears searchResults", "dispose() clears searchResults" ✓
  - AC7 → **no test** — `store.files` / `store.fileFilter` absence from DashboardState not tested → **UNCOVERED**
  - AC8 → **no test** — `files.ts` fileFilter branch removal not tested → **UNCOVERED**
  - AC9 → **no test** — `ArtifactsPane.astro` `#file-filter` removal not tested → **UNCOVERED**

### 2. Adversarial gap
YES — concrete gap found.

The AC4 tests only verify that `fetchFileResults` can be passed to `installPalette` without throwing (structural type check) and that a `setSearchResults`-family method exists on the handle. Neither test verifies that the palette actually calls `fetchFileResults` when the user types a non-empty query. An implementer could:

1. Add `fetchFileResults` as an accepted-but-ignored dep in `PaletteDeps`
2. Add `setSearchResults` as a public setter that updates internal state directly
3. Never wire the debounce or the AbortController

All existing tests pass. The real intent — that typing a query triggers a backend search — is never observed in any test.

### 3. Coverage gap
YES — six uncovered testable properties:

1. AC4 debounce: two rapid query changes must produce only one `fetchFileResults` call (not two). Deterministically testable by counting mock call count after two fast input changes within 150ms.
2. AC4 AbortController: a new query cancels the previous in-flight request. Testable by inspecting whether `signal.aborted` is true on the AbortSignal passed to the first call when the second starts.
3. AC4 actual invocation: `fetchFileResults` is called with the query string when query is non-empty. Testable: call `getEntries("foo")` or trigger query change, then `expect(fetchFileResults).toHaveBeenCalledWith("foo", expect.any(AbortSignal))`.
4. AC7: `store.files` and `store.fileFilter` do not appear in the `DashboardState` type definition (source-level check, like the existing AC4/AC5 source checks in `files.test.ts`).
5. AC8: `files.ts` source does not contain `fileFilter` or references to `store.files` (source-level string check, matching the pattern already used in `files.test.ts`).
6. AC9: `ArtifactsPane.astro` source does not contain `file-filter` (source-level string check).

### 4. Behavior vs implementation detail
UNCLEAR — the `setSearchResults` injection point couples tests to an implementation naming convention.

The test for AC5 is conditioned on `typeof handle["setSearchResults"] === "function"`. If the implementer names it differently (e.g., `_injectResults`), the condition is false, the test body is skipped, and the test passes vacuously — it never actually checks the merge order. This is implementation-detail coupling: the test bets on a specific internal name rather than testing observable behavior (what `getEntries(q)` returns after a fetch resolves).

The AC6 tests have the same pattern — they conditionally call `setSearchResults`, and if the method is absent, the test body exits early and passes without checking anything.

## Verdict summary

FAIL. Three critical gaps:

1. **AC7, AC8, AC9 have no test coverage.** An implementer could skip deleting `store.files`, `store.fileFilter`, and `#file-filter` and pass all gate tests. Add source-level string checks (the pattern already exists in `files.test.ts` for spec 024 and spec 040).

2. **AC4 invocation is not verified.** The test checks that `fetchFileResults` is accepted as a dep and that an injection method exists — but never asserts the palette calls `fetchFileResults` with the query string. Add a mock-call-count assertion: after providing a non-empty query, `fetchFileResults` must have been called exactly once with the query string.

3. **Injection-conditioned tests pass vacuously.** The `if (typeof handle["setSearchResults"] === "function")` guard causes AC5 and AC6 tests to be no-ops when `setSearchResults` is absent. Either (a) make the test unconditionally assert `setSearchResults` exists (fail hard if absent), or (b) remove the conditional and let the test throw — both are better than silent vacuous pass.

Expected corrections:
- Add source-level checks for AC7, AC8, AC9 (string assertions on types.ts, state.ts, files.ts, ArtifactsPane.astro sources).
- Add a test that calls `getEntries("foo")` with a `fetchFileResults` mock and asserts the mock was called with `("foo", <AbortSignal>)`.
- Remove the `if (typeof handle["setSearchResults"] === "function")` guards in AC5/AC6 tests — replace with an unconditional `expect(typeof handle["setSearchResults"]).toBe("function")` then call it.
