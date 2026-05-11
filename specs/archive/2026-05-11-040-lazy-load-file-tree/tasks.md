# Tasks

- [x] 1. Add ChildEntry type and listFilesInPrefix to RepoService (backend repo layer)
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/projects/projects.files.repo.ts]
  - boundary: [apps/backend/src/features/projects/projects.files.repo.ts]

- [x] 2. Update makeRepoServiceTest to support listFilesInPrefix
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/projects/projects.files.repo.ts]
  - boundary: [apps/backend/src/features/projects/projects.files.repo.ts]

- [x] 3. Wire ?prefix query param to listFilesInPrefix in projects.routes.ts
  - agent: main
  - depends: [2]
  - file_targets: [apps/backend/src/features/projects/projects.routes.ts]
  - boundary: [apps/backend/src/features/projects/projects.routes.ts]

- [x] 4. Add folderChildrenCache and fetchFolderChildren to files.ts (frontend)
  - agent: main
  - depends: [3]
  - file_targets: [apps/frontend/src/dashboard/files.ts]
  - boundary: [apps/frontend/src/dashboard/files.ts]

- [x] 5. Update refreshFiles and renderFileTree for lazy-load strategy
  - agent: main
  - depends: [4]
  - file_targets: [apps/frontend/src/dashboard/files.ts]
  - boundary: [apps/frontend/src/dashboard/files.ts]
