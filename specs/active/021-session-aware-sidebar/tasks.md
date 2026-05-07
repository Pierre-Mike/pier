# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec.

- [ ] 1. Extend backend close to spawn `zellij delete-session --force <id>`
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.ts]
- [ ] 2a. [P] Remove session filter from filteredProjects
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]
- [ ] 2b. [P] Add openSessionContextMenu and rewire renderSessions context menu
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]
- [ ] 2c. [P] Add user-select: none to sidebar li elements
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/**/*.css]
