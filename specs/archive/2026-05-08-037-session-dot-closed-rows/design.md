# Design

## Approach

Add `aliveSessions: Set<string>` to `DashboardState` to track project IDs with live backend zellij sessions. Populate it inside `refreshProjects` by fetching `/api/sessions` and filtering for `status: "live"`. Update `renderProjects` to read `store.aliveSessions` and conditionally render a `.session-alive-dot` span inside each project row where the project has an alive backend session.

## Files touched

- `apps/frontend/src/dashboard/types.ts` — add `aliveSessions: Set<string>` to `DashboardState`
- `apps/frontend/src/dashboard/state.ts` — initialise `aliveSessions: new Set()` in store
- `apps/frontend/src/dashboard/projects.ts` — update `refreshProjects` to fetch and populate `store.aliveSessions`; update `renderProjects` to read `store.aliveSessions` and conditionally insert `.session-alive-dot`

## Decisions

- **`aliveSessions` as `Set<string>`** — project IDs with live backend sessions. `Set` matches the existing `projectsWithEvents` pattern. Populated by `refreshProjects` so it refreshes with project data.
- **Polling via `refreshProjects`** — SSE-based live updates are out of scope; polling when the user refreshes is sufficient for the feature.
- **Reuse `.session-alive-dot` CSS** — the class already exists in `dashboard.css` with green `var(--ok)` background. No new CSS needed.
- **Gate path**: `apps/frontend/src/components/` — new test files separate from the frozen spec 034/035 gates in `apps/frontend/src/dashboard/`.

## Risks

- The `activeProject` store validator asserts `activeProject` is in `sessions`; adding `aliveSessions` is additive and doesn't interact with it.
- `api.api.sessions.$get()` — typed Hono RPC. The sessions list returns `{ sessions: Session[] }`. The `Session` type from the backend has `projectId` and `status` fields. A runtime cast is needed at the frontend API boundary (same pattern as `refreshProjects` already uses for projects).

## Out of scope

- Real-time SSE updates to `aliveSessions`.
- Showing the dot on the Close Project button or OPEN session rows (already handled by spec 035).
- Backend changes.
