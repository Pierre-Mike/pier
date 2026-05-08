# Tester review — 033 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC 1 → test "openSessionContextMenu contains an 'Open' menu item label" + "openSessionContextMenu 'Open' action calls selectProject" ✓
  - AC 2 → test "openSessionContextMenu contains an 'Open on GitHub' menu item label" + "fetches the github-url endpoint for the session" + "opens GitHub URL with _blank and noopener,noreferrer" ✓
  - AC 3 → test "openSessionContextMenu calls toast when GitHub URL is null" ✓
  - AC 4 → test "openSessionContextMenu still contains Delete session item (regression guard)" ✓
  - AC 5 → the e2e gate (smoke-033-session-ctx-open-github.ts) IS the artifact for AC 5; tasks:verify runs it ✓

### 2. Adversarial gap
NO — searched, found none structurally exploitable.

`toContain("Open")` could be satisfied by "Open on GitHub" alone (substring match), but the companion test `toContain("selectProject")` requires an actual `selectProject` call, which forces a genuine "Open" item. The two tests close the gap together. No adversarial implementation can satisfy both without adding the "Open" + selectProject action.

### 3. Coverage gap
NO — none found.

The one borderline property (whether `renderSessions` call site is updated to `void openSessionContextMenu(...)`) is implementation detail, not user-observable behavior. The behavioral outcome (menu items present, correct actions triggered) is fully covered.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.

`toContain("selectProject")` asserts invocation of the public switching function by name — this is the right level (observable API call, not internal variable name). `toContain("github-url")` asserts use of the correct API endpoint string — appropriate because this is a protocol-level contract, not an internal implementation detail. No library-specific error strings, no hard-coded internal file paths.

## Verdict summary
PASS. All 5 acceptance criteria map to tests. No adversarial gap found. No coverage gaps. Tests are behavior-pinned to observable function calls and label strings. The spec-033 tests supersede the spec-021 exclusivity assertions that were correctly removed, and the regression guard for "Delete session" is present. Ready for spec-implementer.
