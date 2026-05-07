---
id: 021-session-aware-sidebar
title: Session-aware sidebar with right-click delete
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: apps/backend/src/features/sessions/sessions.repo.test.ts
    level: integration
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on:
  - 020-open-github-active-project
supersedes: null
archived: '2026-05-07'
---

## Intent

Make the sidebar session-aware so users can see at a glance which projects have live zellij sessions, and give them a single right-click action to tear those sessions down. Three concrete changes: (1) the bottom projects list stops filtering out session-bearing projects and instead shows them with a visible "open" dot, (2) the OPEN-sessions list context menu shows only "Delete session" while the bottom projects list keeps its "Open on GitHub" menu, (3) the backend `close` Effect also invokes `zellij delete-session --force <id>` so the zellij server actually frees the session.

## Constraints

- `filteredProjects()` must NOT filter out projects that have an active session; they appear in the bottom list with an "open" dot via the existing `li.open .dot` CSS.
- The sessions list (OPEN section) context menu must call `openSessionContextMenu` which shows only "Delete session" → `closeSession(id)`.
- The projects list (bottom section) context menu must call `openProjectContextMenu` which fetches the GitHub URL and shows "Open on GitHub".
- Sidebar `<li>` elements must have `user-select: none` to prevent OS-native text-selection menus from leaking.
- The backend `close` Effect must spawn `zellij delete-session --force <id>` after registry update; use 2 s timeout race and swallow non-zero / errors with `console.warn`.
- `TerminalSessionsTest.close` remains `() => Effect.void` — no zellij spawn in tests.
- No `any`, no `as` casts outside test files (constitution §5).
- All new behaviour must be exercised by the gate tests.

## Acceptance criteria

- [ ] `filteredProjects()` returns projects that have active sessions (no longer filtered out).
- [ ] The sessions list context menu invokes `openSessionContextMenu` (not `openProjectContextMenu`).
- [ ] `openSessionContextMenu` shows only "Delete session" and calls `closeSession`.
- [ ] The bottom projects list context menu still invokes `openProjectContextMenu` (GitHub URL fetch).
- [ ] Sidebar `<li>` elements carry `user-select: none`.
- [ ] Backend `close` Effect spawns `zellij delete-session --force <id>` and swallows errors.

## Context

- Spec 020 (`020-open-github-active-project`) introduced `openProjectContextMenu` wired to the sessions list — this spec corrects that by splitting it into two context menus.
- Aligned plan accepted 2026-05-07.
