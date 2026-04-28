# Tasks

- [ ] 1. Add terminal clipboard bridge tests and implementation
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/terminal-clipboard.test.ts, apps/frontend/src/dashboard/terminal-clipboard.ts]
  - boundary: [apps/frontend/src/dashboard/terminal-clipboard.test.ts, apps/frontend/src/dashboard/terminal-clipboard.ts]
  - gate: apps/frontend/src/dashboard/terminal-clipboard.test.ts

- [ ] 2. Wire terminal iframes to the clipboard bridge
  - agent: main
  - depends: [Add terminal clipboard bridge tests and implementation]
  - file_targets: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts]
  - gate: apps/frontend/src/dashboard/projects.test.ts
