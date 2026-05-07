# Design

## Approach

Three targeted edits across two apps:

1. **Backend `close`** — append a `Bun.spawn(["zellij", "delete-session", "--force", id])` after the registry update inside `makeTerminalSessionsLive`. Race with a 2 s timeout; swallow non-zero / errors via `console.warn`. The registry transition is already committed before the spawn, so zellij failure cannot desync state.

2. **Frontend `filteredProjects`** — remove the `!store.sessions.has(p.id)` predicate. Session-bearing projects now appear in the bottom list with the existing `li.open .dot` CSS (no CSS change needed).

3. **Frontend context-menu split** — introduce `openSessionContextMenu({ id, x, y })` that shows a single "Delete session" item wired to `closeSession(id)`. Wire it from `renderSessions`; keep `openProjectContextMenu` wired from `renderProjects`. Add `user-select: none` via inline style or CSS on sidebar `<li>` to block OS-native text-selection menus.

## Files touched

- `apps/backend/src/features/sessions/sessions.repo.ts` — extend `close:` in the live layer to spawn `zellij delete-session --force <id>`.
- `apps/frontend/src/dashboard/projects.ts` — remove `sessions.has` filter in `filteredProjects`; add `openSessionContextMenu`; rewire `renderSessions` contextmenu; add `user-select: none` on `<li>`.

## Decisions

- **`zellij delete-session --force <id>`** — single idempotent call; `--force` kills a live session then deletes it. Rejected serial `kill-session` + `delete-session` (doubles spawn overhead) and `kill-session` alone (leaves dead entry on disk).
- **Bottom-list inclusion of open projects** — plain styling + visible dot. Zero CSS change; the `li.open .dot` selector already exists. Rejected dimming (adds friction to search-jump flow) and continued filtering (violates stated user intent).
- **Source-level test assertions** — both gate tests analyze source text so they run in CI without a real zellij binary or DOM.

## Risks

- zellij CLI unavailable in CI — mitigated: spawn is fire-and-forget with error swallow; test uses source analysis not execution.

## Out of scope

- Changing the visual styling of the dot or the OPEN list header.
- Persisting session state across backend restarts (existing behaviour unchanged).
- Any changes to `TerminalSessionsTest` — it keeps `close: () => Effect.void`.
