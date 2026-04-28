# Tasks

- [ ] 1. Prove zellij readonly token creation
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/infra/zellij-auth.test.ts]
  - boundary: [apps/backend/src/infra/zellij-auth.test.ts]
  - gate: apps/backend/src/infra/zellij-auth.test.ts
- [ ] 2. Mark settings route as watch-only readonly
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/shell/routes/settings.ts, apps/backend/src/shell/routes/settings.test.ts]
  - boundary: [apps/backend/src/shell/routes/settings.ts, apps/backend/src/shell/routes/settings.test.ts]
  - gate: apps/backend/src/shell/routes/settings.test.ts
- [ ] 3. Clarify settings UI readonly/watch-only semantics
  - agent: main
  - depends: [2]
  - file_targets: [apps/frontend/src/dashboard/settings.ts, apps/frontend/src/dashboard/settings.test.ts]
  - boundary: [apps/frontend/src/dashboard/settings.ts, apps/frontend/src/dashboard/settings.test.ts]
  - gate: apps/frontend/src/dashboard/settings.test.ts
