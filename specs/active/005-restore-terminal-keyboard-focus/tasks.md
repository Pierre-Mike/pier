# Tasks

- [ ] Remove broken terminal clipboard bridge
  agent: main
  depends: []
  file_targets:
    - apps/frontend/src/dashboard/terminal-clipboard.ts
    - apps/frontend/src/dashboard/terminal-clipboard.test.ts
    - apps/frontend/src/dashboard/projects.ts
  boundary:
    - No injected iframe script or postMessage clipboard bridge remains.

- [ ] Restore terminal iframe focus behavior
  agent: main
  depends: []
  file_targets:
    - apps/frontend/src/dashboard/projects.ts
    - apps/frontend/src/dashboard/terminal-focus.test.ts
    - apps/frontend/src/dashboard/projects.test.ts
  boundary:
    - Terminal iframe is focusable and focused on user activation.
