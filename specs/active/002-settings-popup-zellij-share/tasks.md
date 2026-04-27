# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
`boundary`, and `gate`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec. Globs are evaluated by `Bun.Glob`
  against repo-relative POSIX paths.
  - Single-segment `*` (e.g. `scripts/*.ts`) does NOT cross directory
    boundaries. Use `**` (e.g. `apps/backend/src/**/*.ts`) for recursive matches.
  - `["*"]` is a rare escape hatch meaning "any file" — use sparingly and
    justify in design.md.
  - Missing `boundary:` is currently a deprecation warning, not an error.
    Add one to every new task.
- `gate` is the path to this task's gate file (slice-RED model). Each task
  declares exactly one `gate:` path; paths must be unique across all tasks and
  task indices must be contiguous from 1. The gate file is authored RED by the
  spec-tester for this slice, reviewed by the spec-judge, and then made green
  by the spec-implementer. `tasks:verify` only enforces a slice's gate once its
  `.gate-frozen-<N>` sentinel exists.

Parallel-safe siblings are marked `[P]`.

- [ ] 1. Add `getZellijReadOnlyToken()` to zellij-auth infra
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/infra/zellij-auth.ts, apps/backend/src/infra/zellij-auth.test.ts]
  - boundary: [apps/backend/src/infra/zellij-auth.ts, apps/backend/src/infra/zellij-auth.test.ts]
  - gate: apps/backend/src/infra/zellij-auth.test.ts
- [ ] 2. Add settings route, wire AppType, add frontend FAB + modal
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/shell/routes/settings.ts, apps/backend/src/shell/routes/settings.test.ts, apps/backend/src/shell/api.ts, apps/frontend/src/dashboard/settings.ts, apps/frontend/src/dashboard/SettingsModal.astro]
  - boundary: [apps/backend/src/shell/routes/settings.ts, apps/backend/src/shell/routes/settings.test.ts, apps/backend/src/shell/api.ts, apps/frontend/src/dashboard/**]
  - gate: apps/backend/src/shell/routes/settings.test.ts

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
