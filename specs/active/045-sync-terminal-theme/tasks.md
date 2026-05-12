# Tasks

- [ ] 1. Investigate terminal iframe theme relay mechanism
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/terminal-theme.ts]
  - boundary: [apps/frontend/src/dashboard/terminal-theme.ts]

- [ ] 2. Wire syncTerminalTheme into theme.ts
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/theme.ts]
  - boundary: [apps/frontend/src/dashboard/theme.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
