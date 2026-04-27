---
id: 002-default-session-anchor
title: Add default-session anchor button to sidebar
status: active
kind: code
gate:
  - path: apps/backend/src/infra/terminal-sessions.default.test.ts
    level: unit
  - path: apps/backend/src/shell/routes/sessions.default.test.ts
    level: integration
  - path: apps/frontend/src/dashboard/default-session.test.ts
    level: e2e
created: 2026-04-27
owner: main
depends_on: []
supersedes: null
---

## Intent

Add a persistent "default" session anchor button to the sidebar that always opens a global zellij session named `default` running in the projects root directory. Users can navigate away to project-specific sessions and return to this known home base without searching through the list.

## Constraints

- The default session is global (not tied to any project)
- Session name is the literal string `"default"`
- CWD is `config.projectsRoot`
- Never closeable from the UI (no `×` affordance)
- Rendered as its own iframe, hidden/shown like project iframes
- Persists across reloads via `localStorage`
- Lazy spawn on first click (not on app boot)
- No files refresh for the sentinel key

## Acceptance criteria

- [ ] Backend route `POST /api/sessions/default` spawns or re-attaches to a zellij session named `default` with cwd = `projectsRoot`
- [ ] `TerminalSessions` service has an `openDefault()` method that calls existing `spawnNamedSession`
- [ ] Sidebar has a new button above the project list with visual treatment matching existing items
- [ ] Button shows active state when `store.activeProject === "__default__"`
- [ ] Clicking the button calls `POST /api/sessions/default` and sets `activeProject` to `"__default__"`
- [ ] Frontend stores the default session under sentinel key `"__default__"` in the sessions map
- [ ] `renderSessions()` filters out `"__default__"` so it doesn't appear in the closeable list
- [ ] `setActiveProject("__default__")` skips `refreshFiles()` call
- [ ] `localStorage.setItem("pier:active-project", "__default__")` persists the active state across reloads
- [ ] Reload restores `activeProject` but does not auto-fetch until user clicks the anchor

## Context

Related to existing session management in `apps/backend/src/shell/routes/sessions.ts` and `apps/backend/src/infra/terminal-sessions.ts`. Builds on the per-project session pattern established in prior specs.
