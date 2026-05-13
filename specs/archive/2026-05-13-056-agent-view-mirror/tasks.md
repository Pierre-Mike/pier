# Tasks

- [x] 1. Schema + adapt core
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/agents/agents.schema.ts, apps/backend/src/features/agents/agents.adapt.core.ts, apps/backend/src/features/agents/agents.adapt.core.test.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 2a. [P] Daemon repo
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/agents/agents.daemon.repo.ts, apps/backend/src/features/agents/agents.daemon.repo.test.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 2b. [P] Dispatch repo
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/agents/agents.dispatch.repo.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 2c. [P] Control repo
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/agents/agents.control.repo.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 3. Routes + integration gate
  - agent: main
  - depends: [2a, 2b, 2c]
  - file_targets: [apps/backend/src/features/agents/agents.routes.ts, apps/backend/src/features/agents/agents.routes.test.ts, apps/backend/src/features/agents/agents.routes.integration.test.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 4. SSE stream routes
  - agent: main
  - depends: [3]
  - file_targets: [apps/backend/src/features/agents/agents.stream.routes.ts]
  - boundary: [apps/backend/src/features/agents/**]

- [x] 5. Register slice in composition root
  - agent: main
  - depends: [3]
  - file_targets: [apps/backend/src/api.ts]
  - boundary: [apps/backend/src/**]

- [x] 6. Frontend panel
  - agent: main
  - depends: [5]
  - file_targets: [apps/frontend/src/dashboard/agent-view.ts, apps/frontend/src/dashboard/agent-view.test.ts, apps/frontend/src/styles/dashboard.css, apps/e2e/tests/agent-view.spec.ts]
  - boundary: [apps/frontend/src/**, apps/e2e/tests/**]
