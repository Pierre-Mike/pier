# Tasks

- [ ] 1. Fix resolveProjectCwd to always return join(projectsRoot, projectId)
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.ts]
- [ ] 2. Update spec-023 fallback test to assert new contract
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.test.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.test.ts]
