# Tasks

- [ ] 1. Remove broken terminal clipboard bridge
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/projects.test.ts, apps/frontend/src/dashboard/terminal-clipboard.ts, apps/frontend/src/dashboard/terminal-clipboard.test.ts, specs/active/003-wire-settings-modal/**, specs/active/004-enable-terminal-selection-copy/**, specs/active/004-settings-readonly-zellij-share/**]

- [ ] 2. Restore terminal iframe focus behavior
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/terminal-focus.test.ts, apps/frontend/src/dashboard/projects.test.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts, apps/frontend/src/dashboard/terminal-focus.test.ts, apps/frontend/src/dashboard/projects.test.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
