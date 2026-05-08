# Design

## Approach

Extend `openSessionContextMenu` in `apps/frontend/src/dashboard/projects.ts` to be async and to include two new menu items before "Delete session":

1. **"Open"** — synchronously calls `selectProject(id)` to switch focus to the session.
2. **"Open on GitHub"** — async; fetches `api.api.projects[":id"]["github-url"].$get({ param: { id } })`. On success, opens the URL in a new tab with `window.open(url, "_blank", "noopener,noreferrer")`. On null URL, calls `toast("No GitHub remote for this project")`.

The function signature changes from `(args) => void` to `async (args) => Promise<void>`. The call site in `renderSessions` is already wrapped in `openSessionContextMenu({...})` — it will need a `void` prefix (`void openSessionContextMenu(...)`) to match the pattern used by `openProjectContextMenu`.

The spec 021 exclusivity tests (`does NOT contain Open on GitHub`, `does NOT contain github-url`) are removed from `projects.test.ts` as part of the gate file update. These were written when `openSessionContextMenu` was intentionally minimal; they are now superseded.

## Files touched

- `apps/frontend/src/dashboard/projects.ts` — make `openSessionContextMenu` async, add "Open" and "Open on GitHub" items, add github-url fetch logic and null guard with toast.
- `apps/frontend/src/dashboard/projects.test.ts` — gate file (spec 033 tests added, spec 021 exclusivity tests removed).
- `scripts/smoke-033-session-ctx-open-github.ts` — e2e gate (smoke).

## Decisions

- **Reuse `openProjectContextMenu` pattern exactly** — same endpoint, same toast message, same `window.open` options. Consistency over abstraction; DRY refactor is out of scope.
- **"Open" item before "Open on GitHub" before "Delete session"** — most common action first, destructive action last.
- **Async menu show** — the menu is shown only after the GitHub URL fetch completes, same as `openProjectContextMenu`. This means there is a brief network delay before the menu appears; acceptable for now.

## Out of scope

- Extracting a shared `openGitHubURL` helper (that's a follow-up refactor).
- Adding keyboard shortcuts to menu items.
- Backend changes (the `github-url` endpoint already exists).
