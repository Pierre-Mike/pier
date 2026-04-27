# Design

Add a persistent "default" session anchor to the sidebar that provides a global home base for users.

## Approach

Three parallel groups: backend route + service method, sidebar button + wiring, and state + iframe rendering adjustments.

Backend adds `POST /api/sessions/default` route and `openDefault()` service method calling existing `spawnNamedSession("default", projectsRoot)`. Frontend adds a dedicated button above the projects list, wires it to call the route, and stores the session under sentinel key `"__default__"`. Existing `renderTerminal()` creates the iframe automatically. `renderSessions()` filters out the sentinel, and `setActiveProject()` guards `refreshFiles()` for it.

## Files touched

Backend:
- `apps/backend/src/shell/routes/sessions.ts` — add `POST /default` handler and wire to both `app` and `testApp`
- `apps/backend/src/infra/terminal-sessions.ts` — add `openDefault()` method to interface and implementations

Frontend:
- `apps/frontend/src/components/Sidebar.astro` — add `<button id="default-session-btn">` above `#sessions-section`
- `apps/frontend/src/dashboard/default-session.ts` — new module exporting `wireDefaultSession()` and `selectDefaultSession()`
- `apps/frontend/src/dashboard/index.ts` — import and call `wireDefaultSession()` on boot
- `apps/frontend/src/dashboard/state.ts` — guard `refreshFiles()` inside `setActiveProject()` when key is `"__default__"`
- `apps/frontend/src/dashboard/terminal.ts` — no change needed (iframe auto-created from `store.sessions`)
- `apps/frontend/src/dashboard/sessions.ts` — filter `"__default__"` in `renderSessions()` so it doesn't appear in the closeable list

## Decisions

**Decision 1 — CWD = `config.projectsRoot`**: Matches the existing fallback in `resolveProjectCwd`. Stable and predictable. Rejected: `$HOME` (too broad), configurable via ConfigService (premature), last-active project's cwd (defeats the purpose).

**Decision 2 — Lazy spawn on first click**: `setActiveProject("__default__")` restored from localStorage on boot, but iframe absent until click. Zero cost on cold boot for non-users. Rejected: eager spawn on boot (wasteful), auto-attach on reload (surprising).

**Decision 3 — No close affordance**: The anchor button has no `×`. The session is permanent for the lifetime of the pier process. Respawns transparently if killed externally. Rejected: show `×` and allow close (contradicts purpose), show `×` but reopen on next click (confusing).

**Decision 4 — Sentinel key `"__default__"`**: Double underscores avoid collision with a project literally named `default`. Consistent with existing sentinel patterns elsewhere.

**Decision 5 — `projectId = ""` for the default session**: The registry schema expects a `projectId` string. Empty string is the natural sentinel for a global anchor that isn't tied to a project. Rejected: `null` (would require schema change), `"default"` (could collide with a real project named `default`).

## Out of scope

- Configurable default session name (always `"default"`)
- Multiple global anchors (only one default)
- Per-user default sessions (global to the pier process)
- Auto-spawn on boot (lazy only)
