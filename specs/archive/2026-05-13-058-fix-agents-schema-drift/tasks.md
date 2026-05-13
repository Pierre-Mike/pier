## Tasks

- [x] **T1** — Widen `WorkerEntrySchema` in `agents.schema.ts`
  agent: main
  depends: []
  - file_targets: [apps/backend/src/features/agents/agents.schema.ts]
  - boundary: ["apps/backend/src/features/agents/agents.schema.ts"]

- [x] **T2** — Re-author `roster.fixture.json` to match real roster shape
  agent: main
  depends: [T1]
  - file_targets: [apps/backend/src/features/agents/__fixtures__/roster.fixture.json]
  - boundary: ["apps/backend/src/features/agents/__fixtures__/roster.fixture.json"]

- [x] **T3** — Add `DaemonRosterUnreadable` tag to `agents.daemon.repo.ts`
  agent: main
  depends: [T1]
  - file_targets: [apps/backend/src/features/agents/agents.daemon.repo.ts]
  - boundary: ["apps/backend/src/features/agents/agents.daemon.repo.ts"]

- [x] **T4** — Map `DaemonRosterUnreadable` to 502 in `agents.routes.ts`
  agent: main
  depends: [T3]
  - file_targets: [apps/backend/src/features/agents/agents.routes.ts]
  - boundary: ["apps/backend/src/features/agents/agents.routes.ts"]
