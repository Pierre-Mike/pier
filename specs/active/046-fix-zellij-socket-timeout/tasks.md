# Tasks

- [ ] 1. Add cwd pre-creation to spawnNamedSession
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.ts]
- [ ] 2. Enhance timeout error message with cwd existence status
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/sessions/sessions.repo.ts]
  - boundary: [apps/backend/src/features/sessions/sessions.repo.ts]
- [ ] 3. Verify gate tests pass (GREEN)
  - agent: main
  - depends: [2]
  - file_targets: []
  - boundary: [apps/backend/src/features/sessions/*.test.ts]
