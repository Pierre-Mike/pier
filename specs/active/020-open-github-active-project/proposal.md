---
id: 020-open-github-active-project
title: Right-click → Open on GitHub for active project
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: scripts/smoke-020-sessions-contextmenu.ts
    level: e2e
created: 2026-05-06
owner: main
depends_on: []
supersedes: null
---

## Intent

Right-clicking any session row (active/open projects in the `#sessions` list) should
offer "Open on GitHub" — the same context menu that already works for unopened projects
in `#projects`. Currently `renderSessions()` attaches only a `click` handler; it must
also attach a `contextmenu` handler that calls `openProjectContextMenu({id, x, y})`.

## Constraints

- Single production file touched: `apps/frontend/src/dashboard/projects.ts` only.
- No new backend routes, no CSS changes, no signature changes to `openProjectContextMenu`.
- Reuse `openProjectContextMenu` verbatim — no extraction or refactoring.
- Skip `__default__` row (already filtered by the `renderSessions` loop).
- The fix is symmetric with `renderProjects()` lines 139–142.

## Acceptance criteria

- [ ] `renderSessions()` attaches a `contextmenu` listener on each session `<li>` (excluding `__default__`)
- [ ] The `contextmenu` handler calls `ev.preventDefault()` and `openProjectContextMenu({id: pid, x: ev.clientX, y: ev.clientY})`
- [ ] `openProjectContextMenu` fetches `/api/projects/:id/github-url` for the session's project id
- [ ] On a valid GitHub URL response, `window.open(url, "_blank", "noopener,noreferrer")` is called via the context menu item
- [ ] On null/404 response, `toast("No GitHub remote for this project")` is called
- [ ] `bun test apps/frontend/src/dashboard/projects.test.ts` passes (all tests including new ones)

## Context

`renderProjects()` (line 111) already wires `contextmenu` → `openProjectContextMenu` for
unopened projects. `renderSessions()` (line 149) does not. This gap means right-click on
an open session row produces the browser default context menu instead of the GitHub link.
