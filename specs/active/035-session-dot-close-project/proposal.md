---
id: 035-session-dot-close-project
title: Show session-alive dot on Close Project button
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/projects.integration.test.ts
    level: integration
created: 2026-05-08
owner: main
depends_on: ["034-close-vs-kill-session"]
supersedes: null
---

## Intent

Spec 034 decoupled the Close (×) button from the kill-session API call. As a result, clicking × on a session card silently dismisses the UI while leaving the zellij session alive on the backend. Users have no visual cue that the session will persist. This spec adds a green dot indicator — matching the existing session-alive dot pattern used elsewhere in the dashboard — to or adjacent to the Close button in the sessions list, so users can see at-a-glance that closing will leave a live session running.

## Constraints

- The dot must use the same CSS class (`session-alive-dot` or the existing `dot` class with a new modifier) as the session-alive pattern already present in the sessions list to maintain visual consistency.
- The dot must be rendered inside the session `<li>` element near the close button, observable as a DOM element.
- The dot must be conditional: it appears only when a zellij session is confirmed alive for that project (i.e., the session entry exists in `store.sessions` with a valid `sessionId`).
- Closing (dismissSession) must NOT kill the zellij session — that constraint is owned by spec 034. This spec must not regress it.
- The dot's presence must be observable via DOM attribute or class name for test assertions (not hidden purely by CSS opacity/visibility tricks on `display:none`).
- No new npm dependencies.

## Acceptance criteria

- [ ] AC 1: `renderSessions` renders a `session-alive` dot element (a DOM node with class `session-alive-dot`) inside each session `<li>`, adjacent to or inside the close-button area.
- [ ] AC 2: The `session-alive-dot` element is rendered only when the session entry has a `sessionId` (i.e., session is confirmed alive on the backend).
- [ ] AC 3: The `session-alive-dot` element does NOT appear in the projects list (`renderProjects`) — it is scoped to the sessions section.
- [ ] AC 4: The `renderSessions` source uses the class name `session-alive-dot` (making the dot observable by class for automated tests and future CSS authors).
- [ ] AC 5: Dismissing a session (dismissSession) does not call the kill API — the existing spec 034 behavior is not regressed (regression guard).

## Context

- Depends on spec 034 (`034-close-session-kill-session`): `dismissSession` (UI-only close) and `closeSession` (kill via API) are now separate code paths.
- The session-alive concept: `store.sessions` is a `Map<projectId, Session>`. A session is "alive" when its entry exists with a `sessionId`. The close button (`×`) in `renderSessions` calls `dismissSession` — which clears the store entry without hitting the API, leaving the backend zellij session running.
- Visual reference: each session `<li>` already contains `<span class="dot"></span>` for the colored project dot. The new `session-alive-dot` element should be a sibling span that signals live backend state.
