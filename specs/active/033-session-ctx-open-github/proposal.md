---
id: 033-session-ctx-open-github
title: Add open and GitHub actions to session context menu
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: scripts/smoke-033-session-ctx-open-github.ts
    level: e2e
created: 2026-05-08
owner: main
depends_on: []
supersedes: null
---

## Intent

The session sidebar's right-click context menu currently shows only "Delete session". This spec extends `openSessionContextMenu` in `apps/frontend/src/dashboard/projects.ts` to include two additional actions: "Open" (switches the active project/terminal to this session) and "Open on GitHub" (fetches the project's GitHub remote URL and opens it in a new tab). The change mirrors the existing `openProjectContextMenu` behaviour for GitHub URL lookup, bringing sessions and projects to feature parity on the context menu.

## Constraints

- "Delete session" item must remain in the menu (not removed).
- "Open" action calls `selectProject(id)` to switch focus to the session.
- "Open on GitHub" action fetches via `api.api.projects[":id"]["github-url"].$get` (same endpoint as projects); if no remote is found, show `toast("No GitHub remote for this project")`.
- No new npm/bun dependencies.
- API responses remain backward-compatible — read-only use of the existing endpoint.
- The spec 021 exclusivity tests that asserted "Open on GitHub" must NOT appear in `openSessionContextMenu` are superseded by this spec and must be removed.

## Acceptance criteria

- [ ] AC 1: `openSessionContextMenu` contains an "Open" menu item that calls `selectProject`.
- [ ] AC 2: `openSessionContextMenu` contains an "Open on GitHub" menu item that fetches the `github-url` endpoint and opens the URL in a new tab.
- [ ] AC 3: When the GitHub URL fetch returns null/empty, `toast("No GitHub remote for this project")` is called.
- [ ] AC 4: "Delete session" item remains in the menu (regression guard).
- [ ] AC 5: The smoke script exits 0 when all structural assertions pass against the live `projects.ts` source.

## Context

- Spec 021 (`session-aware sidebar with right-click delete`) introduced `openSessionContextMenu` with only "Delete session" and added exclusivity tests asserting GitHub actions must NOT appear. Those exclusivity tests are now outdated and are removed as part of this spec.
- Spec 020 (`sessions-contextmenu`) established the `openProjectContextMenu` pattern this spec replicates for sessions.
- The `github-url` API endpoint is already implemented and used by `openProjectContextMenu`; no backend changes are needed.
