---
id: 036-fix-session-cwd-project
title: Fix new-session cwd to project folder
status: active
kind: code
gate:
  - path: apps/backend/src/features/sessions/sessions.repo.test.ts
    level: unit
  - path: scripts/smoke-035-session-cwd-project.ts
    level: e2e
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: ["023-session-cwd-project-folder"]
supersedes: null
---

## Intent

When a new zellij session is opened for a project via `sessions.open(projectId)`, the session must always start with its cwd set to `<projectsRoot>/<projectId>` (e.g. `~/Github/pier`). Currently, `resolveProjectCwd` falls back to `projectsRoot` when the project directory does not yet exist on disk. The correct behaviour is to use `projectsRoot/projectId` unconditionally — if the directory doesn't exist, zellij will still spawn there (or fail gracefully), but the intent is always the project folder.

## Constraints

- `resolveProjectCwd` signature must remain compatible with existing callers.
- The changed function must always return `join(projectsRoot, projectId)` — no fallback to `projectsRoot` for missing directories.
- Existing tests for the `resolveProjectCwd` helper (spec 023) must be updated: the "missing dir → fall back to projectsRoot" test must now assert `join(projectsRoot, projectId)` instead.
- No new npm/bun dependencies.
- Non-goal: auto-creating the project directory on disk.
- Non-goal: changing `openDefault()` cwd (it already uses `projectsRoot` by design).

## Acceptance criteria

- [ ] `resolveProjectCwd(root, 'my-project')` returns `join(root, 'my-project')` when the directory exists (unchanged).
- [ ] `resolveProjectCwd(root, 'missing-project')` returns `join(root, 'missing-project')` even when the directory does not exist (changed — no longer falls back to `root`).
- [ ] `sessions.open(projectId)` passes `join(projectsRoot, projectId)` to the zellij spawn call regardless of whether the directory exists on disk.
- [ ] Smoke script exits 0 exercising the new behaviour end-to-end.

## Context

Depends on spec 023 (which exported `resolveProjectCwd` and added cwd-threading tests). Spec 023 tested the old fallback behaviour; this spec changes that behaviour and the tests must reflect the new contract.
