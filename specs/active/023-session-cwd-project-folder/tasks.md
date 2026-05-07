# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec. Globs are evaluated by `Bun.Glob`
  against repo-relative POSIX paths.

- [ ] 1. Export `resolveProjectCwd` from `sessions.repo.ts` as a top-level function
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.ts]
- [ ] 2. Add four cwd-resolution tests to `sessions.repo.test.ts` and smoke script
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.test.ts, scripts/smoke-023-session-cwd.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.test.ts, scripts/smoke-023-session-cwd.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
