# Tasks

- [ ] 1. Remove broken terminal clipboard bridge
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts, apps/frontend/src/dashboard/terminal-clipboard.ts, apps/frontend/src/dashboard/terminal-clipboard.test.ts]

- [ ] 2. Restore terminal iframe focus behavior
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/terminal-focus.test.ts, apps/frontend/src/dashboard/projects.test.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/terminal-focus.test.ts, apps/frontend/src/dashboard/projects.test.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
