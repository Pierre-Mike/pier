---
id: 023-session-cwd-project-folder
title: Spawn project sessions in ~/Github/<projectId>
status: active
kind: code
gate:
  - path: apps/backend/src/features/sessions/sessions.repo.test.ts
    level: unit
  - path: scripts/smoke-023-session-cwd.ts
    level: e2e
created: 2026-05-07
owner: main
depends_on: []
supersedes: null
---

## Intent

When the sidebar opens a brand-new zellij session for a project, the session's initial pane must start in `<projectsRoot>/<projectId>` (default: `~/Github/<projectId>`). If that directory does not exist, fall back to `<projectsRoot>`. The default tab opened via `openDefault()` always starts in `<projectsRoot>`. Without a test, this contract is invisible to CI and any refactor could silently regress cwd plumbing.

## Constraints

- `resolveProjectCwd` must be exported from `sessions.repo.ts` as a top-level pure-ish function (takes `projectsRoot` and `projectId` as explicit parameters).
- Existing tests must continue to pass.
- No new files — extend `sessions.repo.test.ts`.
- Do not mock `node:fs/promises`; use a real tmp dir created with `mkdtempSync`.
- Service-surface tests must call `open()` / `openDefault()` and assert the `cwd` captured at the `Bun.spawn` boundary.
- Non-goal: changing zellij spawn behaviour beyond cwd.
- Non-goal: testing the zellij web auto-create path.

## Acceptance criteria

- [ ] (1) `resolveProjectCwd` is exported from `sessions.repo.ts`
- [ ] (2) `resolveProjectCwd(projectsRoot, projectId)` returns `<projectsRoot>/<projectId>` when that directory exists
- [ ] (3) `resolveProjectCwd(projectsRoot, projectId)` returns `<projectsRoot>` when that directory does not exist
- [ ] (4) `open(projectId)` passes the resolved cwd to `Bun.spawn` (captured at the mock boundary)
- [ ] (5) `openDefault()` passes `<projectsRoot>` to `Bun.spawn`

## Context

- Implementation already lives at lines ~123–132 of `sessions.repo.ts` as an unexported closure.
- Related: spec 021 locked the `close` spawn contract in the same file using source-extraction tests.
- The `ConfigService` test layer (`ConfigTest`) already provides a stable `projectsRoot: "/tmp/test-projects"`.
