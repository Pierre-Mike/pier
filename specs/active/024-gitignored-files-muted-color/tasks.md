# Tasks

- [ ] 1. Add `ignored: boolean` to RepoFile and update listFiles implementation
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/projects/projects.files.repo.ts]
  - boundary: [apps/backend/src/features/projects/projects.files.repo.ts]

- [ ] 2. Add `ignored?: boolean` to FileEntry type
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/types.ts]
  - boundary: [apps/frontend/src/dashboard/types.ts]

- [ ] 3. Propagate ignored through file tree renderer and add CSS class
  - agent: main
  - depends: [2]
  - file_targets: [apps/frontend/src/dashboard/files.ts]
  - boundary: [apps/frontend/src/dashboard/files.ts]
