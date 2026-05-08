# Design

## Approach

Add a `dismissSession(id)` function to `projects.ts` that removes a session from `store.sessions` and cleans up the iframe — without calling `DELETE /api/sessions/:id`. Wire the `×` close button in `renderSessions` to `dismissSession`. Rename the "Delete session" label in `openSessionContextMenu` to "Kill session". `closeSession` (the existing API-calling function) stays unchanged and is now the exclusive entry point for the destructive kill action, reached only via right-click.

## Files touched

- `apps/frontend/src/dashboard/projects.ts` — add `dismissSession`, update `renderSessions` close button handler, rename "Delete session" → "Kill session" in `openSessionContextMenu`

## Decisions

- **dismissSession as a new exported function** — exporting it allows the integration test to import and test it directly. It's parallel in shape to `closeSession` but skips the API call.
- **Rename "Delete session" → "Kill session"** — matches the user's vocabulary and distinguishes it from the soft close action.
- **closeSession unchanged** — no behavior change; the test just confirms `$delete` is still present in its body.
- **No new API routes** — the DELETE endpoint is unchanged; only the UI wiring changes.

## Risks

- `store.activeProject` validator: dismissing the currently active session sets `store.activeProject` to null or the next session. Same logic as `closeSession` — replicate it in `dismissSession`.

## Out of scope

- Backend session persistence / reconnect on next open (that's a separate spec).
- Renaming the API endpoint.
- Any other context menu items beyond "Kill session".
