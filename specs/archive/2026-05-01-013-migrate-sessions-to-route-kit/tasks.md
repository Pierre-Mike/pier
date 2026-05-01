# Tasks

Ordered checklist. Tasks execute sequentially in the worktree.

- [x] 1. Rewrite sessions.routes.ts to use route() + mountPair()
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/sessions.routes.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.routes.ts]
- [x] 2. Verify gates pass
  - agent: main
  - depends: [1]
  - file_targets: []
  - boundary: [apps/backend/src/**/*.ts]
