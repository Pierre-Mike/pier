# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- [ ] 1. Rename drops storage path in repo.ts (`.drops` → `.pier/drops`)
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/infra/repo.ts]
  - boundary: [apps/backend/src/infra/repo.ts, apps/backend/src/infra/repo.test.ts]

- [ ] 2. Add writeChars to TerminalSessions interface and implementations
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/infra/terminal-sessions.ts]
  - boundary: [apps/backend/src/infra/terminal-sessions.ts, apps/backend/src/infra/terminal-sessions.test.ts]

- [ ] 3. Extend projects-drop route to call writeChars and return injected field
  - agent: main
  - depends: [2]
  - file_targets: [apps/backend/src/shell/routes/projects-drop.ts]
  - boundary: [apps/backend/src/shell/routes/projects-drop.ts, apps/backend/src/shell/routes/projects-drop.test.ts]

- [ ] 4. Update frontend drop handler to branch on injected response field
  - agent: main
  - depends: [3]
  - file_targets: [apps/frontend/src/dashboard/drop.ts]
  - boundary: [apps/frontend/src/dashboard/drop.ts, apps/frontend/src/dashboard/drop.test.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
