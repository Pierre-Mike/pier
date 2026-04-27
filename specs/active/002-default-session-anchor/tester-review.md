# Tester review — 002-default-session-anchor (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage
**NO**

Mapping:
- AC 1: Backend route `POST /api/sessions/default` spawns/re-attaches → `sessions.default.test.ts`: "opens the default session" + "is idempotent" ✓
- AC 2: `TerminalSessions` service has `openDefault()` → `terminal-sessions.default.test.ts`: "opens a session named 'default'" ✓
- AC 3: Sidebar has a new button → **NO TEST** → UNCOVERED
- AC 4: Button shows active state → **NO TEST** → UNCOVERED
- AC 5: Clicking calls route and sets activeProject → **NO TEST** → UNCOVERED
- AC 6: Frontend stores under `"__default__"` → **NO TEST** → UNCOVERED
- AC 7: `renderSessions()` filters out `"__default__"` → **NO TEST** → UNCOVERED
- AC 8: `setActiveProject("__default__")` skips `refreshFiles()` → **NO TEST** → UNCOVERED
- AC 9: `localStorage.setItem` persists state → **NO TEST** → UNCOVERED
- AC 10: Reload restores but doesn't auto-fetch → **NO TEST** → UNCOVERED

### 2. Adversarial gap
**YES**

An implementer could add the backend route and `openDefault()` method correctly (satisfying the two existing tests), but never touch the frontend. The tests would pass, but users would have no UI button to access the feature — the intent is completely unfulfilled.

### 3. Coverage gap
**YES**

Uncovered testable properties:
- Clicking the default button actually sets `store.activeProject` to `"__default__"`
- The `"__default__"` session is stored in `store.sessions` after the route call
- `renderSessions()` excludes the `"__default__"` key from the rendered list
- `setActiveProject("__default__")` does NOT call `refreshFiles()`
- `localStorage.getItem("pier:active-project")` returns `"__default__"` after clicking
- Reload restores `activeProject` from localStorage but does NOT spawn the iframe until user interaction

### 4. Behavior vs implementation detail
**YES**

All assertions are on observable outputs (response shape, session properties, status codes). No internal function names, file paths, or library-specific strings are hard-coded.

## Verdict summary

The gate covers only the backend half of the spec (route handler + service method). All frontend acceptance criteria (3–10) have no corresponding tests. This is a full-stack `kind: code` spec, so the gate must verify both backend and frontend behavior.

Add an end-to-end test file (e.g., `apps/frontend/src/dashboard/default-session.e2e.test.ts` or similar) that:
1. Simulates a click on the default button
2. Asserts `store.activeProject === "__default__"`
3. Asserts the `"__default__"` key exists in `store.sessions`
4. Asserts `renderSessions()` output does NOT contain the `"__default__"` entry
5. Asserts `setActiveProject("__default__")` does NOT trigger `refreshFiles()` (e.g., via a spy or stub)
6. Simulates a page reload and asserts `localStorage` restoration + no auto-fetch

Alternatively, structure the gate as:
- Unit: `apps/backend/src/infra/terminal-sessions.default.test.ts` (already present)
- Integration: `apps/backend/src/shell/routes/sessions.default.test.ts` (already present)
- E2E: A frontend test that exercises the full click → route → state → render flow

The constitution requires ≥1 unit AND ≥1 integration/e2e for `kind: code`. The current gate has two backend tests (unit + integration), but the e2e level must also cover the user-facing surface (the sidebar button + state management).
