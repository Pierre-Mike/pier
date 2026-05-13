---
id: 060-fix-attach-resume-cwd
title: Fix attach to resume claude with session cwd
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/agent-view.test.ts
    level: unit
  - path: apps/backend/src/features/agents/agents.adapt.core.test.ts
    level: unit
  - path: apps/e2e/tests/agent-view.spec.ts
    level: e2e
created: 2026-05-13
owner: main
depends_on: []
supersedes: null
---

## Intent

The pier agent-view dashboard shows session cards grouped by status (Needs input / Working / Completed), each with an "Attach" button. Currently clicking Attach dispatches `pier:zellij-launch` with `claude attach <shortId>`, which opens a new disconnected shell — losing both the conversation context and the original working directory. This spec changes the Attach handler to use `claude --resume <sessionId>` launched in the session's original cwd, so the user rejoins the existing conversation from the right directory. The `sessionId` (full UUID) is already present in `state.json` on disk; it needs to be exposed in `AgentRow` and threaded to the frontend Attach handler.

## Constraints

- `claude --resume <sessionId>` must be used, NOT `claude attach <shortId>`
- The `pier:zellij-launch` custom event detail must include both `command` and `cwd` fields
- `AgentRow` (both backend core and frontend) must gain a `sessionId: string` field
- `stateToAgentRow` in `agents.adapt.core.ts` must extract `sessionId` from the state object (already present in state.json fixtures)
- No new npm/bun dependencies
- Adding `sessionId` to `AgentRow` is additive — no route changes required beyond the type flowing through
- The old `claude attach` string must be replaced everywhere in agent-view.ts

## Acceptance criteria

- [ ] AC1: `agents.adapt.core.ts` `AgentRow` type includes `sessionId: string` field
- [ ] AC2: `stateToAgentRow` extracts `sessionId` from the state object and returns it in `AgentRow`
- [ ] AC3: `agent-view.ts` `AgentRow` interface includes `sessionId: string` field
- [ ] AC4: `attachAgent` in `agent-view.ts` dispatches `pier:zellij-launch` with `command: "claude --resume <sessionId>"` (not `claude attach`)
- [ ] AC5: `attachAgent` includes `cwd: row.cwd` in the `pier:zellij-launch` event detail
- [ ] AC6: The string `claude attach` is absent from `agent-view.ts` (replaced by `claude --resume`)

## Context

- spec 056 (agent-view-mirror): introduced `agent-view.ts` and the `pier:zellij-launch` event channel
- spec 057 (wire-agent-view-mount): wired `mountAgentView` into the dashboard
- spec 058 (fix-agents-schema-drift): fixed roster decode; `sessionId` is in `WorkerEntry` schema
- spec 059 (repo-grouped-project-tabs): added repo-grouped tabs with agent view
- state.json fixture (`__fixtures__/state-working.fixture.json`) already has `sessionId: "session-abc-working"`
