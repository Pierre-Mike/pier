---
id: 034-close-vs-kill-session
title: Separate close-session from kill-session
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/projects.integration.test.ts
    level: integration
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-08'
---

## Intent

Currently the `×` close button on an open session card calls `closeSession`, which deletes the backend session via `DELETE /api/sessions/:id`. The user wants closing a session (via the `×` button) to be a UI-only action that removes the session card from the dashboard without terminating the underlying zellij session. Killing the session (terminating the zellij process) should remain an explicit, destructive action accessible only through the right-click context menu on the session card.

## Constraints

- The `×` close button must NOT call the `DELETE /api/sessions/:id` endpoint.
- "Kill session" must appear as a right-click context menu item on session cards (in `openSessionContextMenu`).
- Killing a session calls the `DELETE /api/sessions/:id` endpoint (same API, different trigger).
- The label "Delete session" in the context menu should be renamed to "Kill session" to match the user's mental model.
- API responses must remain backward-compatible; no new required fields on existing endpoints.
- No new npm/bun dependencies.

## Acceptance criteria

- [ ] AC 1: Clicking the `×` close button on a session card removes the session from `store.sessions` and the UI without calling the delete sessions API endpoint.
- [ ] AC 2: The close action (`dismissSession`) is a new pure UI function distinct from `closeSession`.
- [ ] AC 3: `openSessionContextMenu` exposes a "Kill session" item that calls `closeSession` (the function that calls the delete API).
- [ ] AC 4: The context menu item is labeled "Kill session" (not "Delete session").
- [ ] AC 5: `closeSession` still calls `DELETE /api/sessions/:id` (the API kill path is preserved, just not wired to the close button).

## Context

Spec 021 introduced `openSessionContextMenu` with a "Delete session" label wired to `closeSession`. This spec renames that action to "Kill session" and separates the `×` button from the API call, satisfying the user's expectation that closing a project card is non-destructive.
