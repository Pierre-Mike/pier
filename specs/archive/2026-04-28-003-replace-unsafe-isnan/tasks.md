# Tasks

- [x] 1. Replace unsafe global isNaN usage
  - agent: main
  - depends: []
  - file_targets: [scripts/retro-preflight.ts]
  - boundary: [scripts/retro-preflight.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
