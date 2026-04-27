---
id: 003-zellij-cwd-keys
title: Fix per-project zellij session cwd and key duplication
status: archived
kind: code
gate:
  - path: apps/backend/src/infra/zellij-ws-proxy.test.ts
    level: unit
  - path: apps/backend/src/infra/terminal-sessions.test.ts
    level: unit
  - path: apps/backend/src/infra/zellij-auth.test.ts
    level: unit
created: 2026-04-27T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-27'
---

## Intent

New Claude Code sessions launched from pier open in the wrong directory (always
`apps/backend`, the daemon's cwd) and key input is duplicated when multiple
browser clients attach to the same zellij session. This spec fixes both bugs:
(1) `TerminalSessions.open` spawns or attaches a named zellij session bound to
`project.path`; (2) the WS proxy closes stale upstream connections before
installing a new one for the same session id; (3) structured lifecycle logs are
added to both `zellij-ws-proxy.ts` and `terminal-sessions.ts` to make future
diagnosis observable.

## Constraints

- No changes to the frontend. The URL shape `/zellij/{id}` and the cookie-based
  auth mechanism remain unchanged.
- One shared `zellij web -d` daemon on port 8082. Per-project isolation is
  achieved via named zellij sessions (`zellij --session <name>`), not separate
  daemons.
- `project.path` is sourced from `ProjectsService` (already in the DI graph);
  no new external dependencies.
- `TerminalSessions` interface signature must not change — callers pass
  `projectId`, the layer resolves the path internally.
- Log events must be structured (object with named fields), not free-form
  strings.
- No `any` types. No `as` casts outside test files. `strict: true` throughout.

## Acceptance criteria

- [ ] `TerminalSessions.open(projectId)` resolves the project's `path` from
  `ProjectsService` and passes `cwd: project.path` when spawning a new named
  zellij session.
- [ ] The sanitized `projectId` (existing `replace(/[^a-zA-Z0-9_-]/g, "_")`)
  becomes the zellij `--session` argument, making sessions 1:1 with projects.
- [ ] Re-opening an existing live session does not spawn a second zellij
  process (idempotent attach).
- [ ] `zellij-ws-proxy.ts` emits a structured log event on `upgrade` containing
  `sessionId` and current active bridge count.
- [ ] `zellij-ws-proxy.ts` emits a structured log event on `open` containing
  `sessionId` and `upstreamReadyState`.
- [ ] `zellij-ws-proxy.ts` emits a structured log event on `close` containing
  `sessionId` and `reason`.
- [ ] Opening a second downstream WS for the same `sessionId` closes the
  previous upstream before the new upstream is created (no double-write path).
- [ ] `zellij-auth.ts` `ensureZellijWeb` verifies no duplicate daemon is running
  before spawning a new one.

## Context

Root-cause analysis from `/do` interview: `Bun.spawn(["zellij","web","-d"])`
in `zellij-auth.ts:112` inherits backend cwd; `TerminalSessions.open` never
resolves `project.path` or creates a named session. Key duplication cause is
not yet confirmed — diagnostic logs (slice 1) are required before the targeted
fix (slice 3) can be written.
