# Blocker: spec 021 — Session-aware sidebar with right-click delete (implementer)

## Status
Implementer stuck at 2026-05-07T00:00:00Z.

## Reason
The frozen gate tests contain a direct logical contradiction that cannot be
resolved by any implementation. The `describe("renderSessions contextmenu —
spec 020", ...)` block contains three tests that assert `renderSessionsBody`
CONTAINS the string `"openProjectContextMenu"` (lines 73, 78–85, 88–95 of
`apps/frontend/src/dashboard/projects.test.ts`). The `describe("renderSessions
context menu split — spec 021", ...)` block contains a test that asserts
`renderSessionsBody` does NOT contain `"openProjectContextMenu"` (line 200–203).

Both test groups reference the same `const renderSessionsBody` computed once at
module load (line 28). No implementation of `renderSessions` can simultaneously
contain and not contain the string `"openProjectContextMenu"` — the two
assertions are mutually exclusive.

## Last state
- Task in flight: 2b — Add openSessionContextMenu and rewire renderSessions context menu
- Attempts on that task: 1
- Last `tasks:verify` output (tail):

```
(fail) renderSessions contextmenu — spec 020 > renderSessions contextmenu handler calls openProjectContextMenu [0.21ms]
(fail) renderSessions contextmenu — spec 020 > renderSessions passes project id to openProjectContextMenu [0.02ms]
(fail) renderSessions contextmenu — spec 020 > renderSessions passes clientX and clientY to openProjectContextMenu [0.02ms]

 24 pass
 3 fail
 32 expect() calls
Ran 27 tests across 1 file. [12.00ms]
✖ 021-session-aware-sidebar (code) — tests failed (apps/frontend/src/dashboard/projects.test.ts)
error: script "tasks:verify" exited with code 1
```

## Worktree
Path: /Users/pierre-mikel/Github/pier/.agentic/worktrees/session-aware-sidebar
Branch: spec/session-aware-sidebar
HEAD: d9b458ba4c2a0627ca1ccc04b75d4db0b1df2430

## Resume paths
1. Edit the frozen gate `apps/frontend/src/dashboard/projects.test.ts` to remove
   the three spec-020 tests that assert `renderSessionsBody` contains
   `"openProjectContextMenu"` (lines 73–95), since spec 021 explicitly supersedes
   this wiring. Then remove `.gate-frozen`, delete `tester-review.md`, and
   re-run `/do session-aware-sidebar` — the spec-tester dispatches afresh with
   corrected tests.
2. Alternatively: in the spec-020 describe block, change lines 73–95 to assert
   against `renderProjectsBody` (the bottom list) instead of `renderSessionsBody`
   — the GitHub-URL context menu belongs to `renderProjects` post-split, so the
   spec-020 intent is still tested correctly after the wiring change.
3. Close the PR (if open) and abandon the worktree via
   `bun scripts/worktree-close.ts session-aware-sidebar`.
