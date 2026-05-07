# Design

Minimal revert of the two lines spec 021 changed in `filteredProjects` and `renderProjects`.

## Approach

1. In `filteredProjects()`: restore the `!store.sessions.has(p.id)` guard so session-bearing projects are excluded from the bottom list.
2. In `renderProjects()`: remove the `if (store.sessions.has(p.id)) li.classList.add("open")` line — it is now unreachable because session-bearing projects never enter `filteredProjects()`'s return value and therefore never reach the render loop.

## Files touched

- `apps/frontend/src/dashboard/projects.ts` — two-line change: restore filter clause, remove dead `open`-class assignment.

## Decisions

- **Full revert of 021 Move #1** — restore `!store.sessions.has(p.id)` in the filter predicate. Rejected alternative: keep projects in both lists and hide duplicates with CSS — too fragile and violates the single-list invariant.
- **Remove dead `open`-class line** — since the `<li>` for a session-bearing project is never created in the bottom list, the `classList.add("open")` branch is dead code. Removing it avoids confusion about where the open-dot visual comes from.

## Risks

- None significant. The change is two lines; the OPEN sessions list (renderSessions) is untouched.

## Out of scope

- Backend changes.
- Context-menu split (spec 021).
- `user-select: none` (spec 021).
- `openSessionContextMenu` / "Delete session" (spec 021).
