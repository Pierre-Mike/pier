# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
`boundary`, and `gate`.

- [ ] 1. Add bridge-lifecycle structured logs to zellij-ws-proxy and terminal-sessions
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/infra/zellij-ws-proxy.ts, apps/backend/src/infra/terminal-sessions.ts]
  - boundary: [apps/backend/src/infra/zellij-ws-proxy.ts, apps/backend/src/infra/zellij-ws-proxy.test.ts, apps/backend/src/infra/terminal-sessions.ts, apps/backend/src/infra/terminal-sessions.test.ts]
  - gate: apps/backend/src/infra/zellij-ws-proxy.test.ts

- [ ] 2. Per-project named zellij session with project.path as cwd
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/infra/terminal-sessions.ts]
  - boundary: [apps/backend/src/infra/terminal-sessions.ts, apps/backend/src/infra/terminal-sessions.test.ts]
  - gate: apps/backend/src/infra/terminal-sessions.test.ts

- [ ] 3. Close stale upstream on duplicate downstream connect + guard ensureZellijWeb against duplicate daemons
  - agent: main
  - depends: [2]
  - file_targets: [apps/backend/src/infra/zellij-ws-proxy.ts, apps/backend/src/infra/zellij-auth.ts]
  - boundary: [apps/backend/src/infra/zellij-ws-proxy.ts, apps/backend/src/infra/zellij-auth.ts, apps/backend/src/infra/zellij-auth.test.ts]
  - gate: apps/backend/src/infra/zellij-auth.test.ts

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
