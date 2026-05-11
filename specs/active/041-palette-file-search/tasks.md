# Tasks — 041 palette-file-search

Ordered checklist. Tasks 2a/2b/2c are parallel-safe after task 1.

- [ ] 1. Add searchFiles to RepoService interface, live layer, and test layer
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/projects/projects.files.repo.ts]
  - boundary: [apps/backend/src/features/projects/projects.files.repo.ts]

- [ ] 2a. [P] Wire search route in projects.routes.ts
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/projects/projects.routes.ts]
  - boundary: [apps/backend/src/features/projects/projects.routes.ts]

- [ ] 2b. [P] Refactor palette.ts — remove store.files, add fetchFileResults + setSearchResults
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/palette.ts]
  - boundary: [apps/frontend/src/dashboard/palette.ts]

- [ ] 2c. [P] Delete store.files and store.fileFilter from types.ts and state.ts
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/types.ts, apps/frontend/src/dashboard/state.ts]
  - boundary: [apps/frontend/src/dashboard/types.ts, apps/frontend/src/dashboard/state.ts]

- [ ] 3a. [P] Remove fileFilter branch from files.ts
  - agent: main
  - depends: [2c]
  - file_targets: [apps/frontend/src/dashboard/files.ts]
  - boundary: [apps/frontend/src/dashboard/files.ts]

- [ ] 3b. [P] Update files.test.ts — remove fileFilter and store.files assertions
  - agent: main
  - depends: [2c]
  - file_targets: [apps/frontend/src/dashboard/files.test.ts]
  - boundary: [apps/frontend/src/dashboard/files.test.ts]

- [ ] 4. Remove #file-filter from ArtifactsPane.astro
  - agent: main
  - depends: [2c]
  - file_targets: [apps/frontend/src/components/ArtifactsPane.astro]
  - boundary: [apps/frontend/src/components/ArtifactsPane.astro]

Task box ticking happens via scripts/tasks-verify.ts, not manually.
