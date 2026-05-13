# Tasks

- [x] 1. Add sessionId to backend AgentRow and stateToAgentRow
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/agents/agents.adapt.core.ts]
  - boundary: [apps/backend/src/features/agents/agents.adapt.core.ts]

- [x] 2. Update frontend AgentRow and attachAgent to use claude --resume with cwd
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/agent-view.ts]
  - boundary: [apps/frontend/src/dashboard/agent-view.ts]
