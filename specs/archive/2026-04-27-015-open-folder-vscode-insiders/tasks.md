# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec. Globs are evaluated by `Bun.Glob`
  against repo-relative POSIX paths.

- [x] 1. Author the gate test file
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/viewer.test.ts]
  - boundary: [apps/frontend/src/dashboard/viewer.test.ts]
- [x] 2. Export `vscodeFolderUrl` helper from viewer.ts
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/viewer.ts]
  - boundary: [apps/frontend/src/dashboard/viewer.ts]
- [x] 3. Extract and export `renderViewerHead` pure helper from viewer.ts
  - agent: main
  - depends: [2]
  - file_targets: [apps/frontend/src/dashboard/viewer.ts]
  - boundary: [apps/frontend/src/dashboard/viewer.ts]
- [x] 4. Wire `Folder ↗` anchor into viewer-head bar
  - agent: main
  - depends: [3]
  - file_targets: [apps/frontend/src/dashboard/viewer.ts]
  - boundary: [apps/frontend/src/dashboard/viewer.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
