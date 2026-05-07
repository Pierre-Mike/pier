---
id: 022-single-list-projects
title: Restore single-list invariant for open projects
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
  - 021-session-aware-sidebar
supersedes: null
archived: '2026-05-07'
---

## Intent

Restore the sidebar invariant that a project lives in exactly one list at a time. Spec 021 deliberately removed the `!store.sessions.has(p.id)` filter from `filteredProjects()` so session-bearing projects appeared in the bottom list with an "open" dot. This spec reverts that decision: session-bearing projects must appear only in the top OPEN section and must be excluded from the bottom search/filter list. The now-dead `li.classList.add("open")` line in `renderProjects` is also removed as cleanup, since the `<li>` it would target never renders when the filter is in place.

## Constraints

- `filteredProjects()` MUST exclude any project whose id is present in `store.sessions`.
- `renderProjects` MUST NOT add an "open" class to any `<li>` (the open-dot visual belongs exclusively to the OPEN sessions list).
- Backend, context-menu split, `user-select: none`, and "Delete session" action introduced by 021 stay untouched.
- No `any`, no `as` casts outside test files (constitution §5).
- Only `apps/frontend/src/dashboard/projects.ts` is modified.

## Acceptance criteria

- [ ] `filteredProjects()` excludes projects that have an active session in `store.sessions`.
- [ ] `filteredProjects()` still returns projects that have no active session.
- [ ] `renderProjects` body does NOT contain a `sessions.has(...).add("open")` pattern.
- [ ] All existing spec-020 and spec-021 tests (ctx-menu split, user-select, session ctx-menu) remain green.

## Context

- Spec 021 (`021-session-aware-sidebar`) introduced the filter removal and the `open` class assignment that this spec reverts.
- The bottom list and top OPEN list must remain mutually exclusive: no project should appear in both simultaneously.
