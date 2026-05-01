# Tasks

- [x] 1. Wire settings modal into dashboard init
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/pages/index.astro, apps/frontend/src/dashboard/settings.test.ts]
  - boundary: [apps/frontend/src/pages/index.astro, apps/frontend/src/dashboard/settings.test.ts]
  - gate: apps/frontend/src/dashboard/settings.test.ts
