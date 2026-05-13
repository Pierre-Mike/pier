---
id: 056-agent-view-mirror
title: Mirror Claude agent view as a web panel
status: archived
kind: code
gate:
  - path: apps/backend/src/features/agents/agents.adapt.core.test.ts
    level: unit
  - path: apps/backend/src/features/agents/agents.routes.integration.test.ts
    level: integration
  - path: apps/e2e/tests/agent-view.spec.ts
    level: e2e
created: 2026-05-13T00:00:00.000Z
owner: main
depends_on:
  - 011-backend-feature-slice-plan
supersedes: null
archived: '2026-05-13'
---

## Intent

Pier must surface every locally-dispatched background Claude Code session as a first-class, observable, controllable row in the browser. Users can dispatch, watch, peek, attach, and stop background agents from the dashboard instead of running `claude agents` in a terminal. A new backend feature slice `features/agents/` reads the daemon's on-disk state, shells the `claude` CLI for actions, and pushes deltas through the existing SSE bus. The frontend grows one panel mirroring the TUI's three-state grouping and reuses Pier's zellij iframe as the attach surface.

## Constraints

- Backend slice must follow FCIS layering: pure adapt core, Effect repos, Hono shell routes
- Gate: integration test using fixture daemon state (no live daemon required at test time)
- CLI version gate: return 409 if `cliVersion < 2.1.139` or `~/.claude/daemon/roster.json` missing
- No `any` types; no `as` casts outside test files
- No new external dependencies not already transitively available (chokidar via drops/artifacts)
- Frontend: vanilla TS dashboard module (no framework); CSS in `src/styles/dashboard.css`
- No inline reply UI; attach-only for v1 via zellij iframe
- No ptySock IPC in v1
- No write-to-pane integration in v1
- E2E gate is a minimal smoke test (panel renders three section headings); full Playwright interaction tests are deferred to a later spec
- No PR-status dots on rows (deferred)

## Acceptance criteria

- [ ] AC1: `GET /api/agents` returns an `AgentRow[]` containing one `working`, one `needs-input`, and one `completed` entry when the daemon state consists of the three fixture files (`state-working.fixture.json`, `state-needs-input.fixture.json`, `state-completed.fixture.json`)
- [ ] AC2: `POST /api/agents` with a stubbed `claude --bg` spawn (stdout: `backgrounded · abcd1234`) returns `{ id, shortId: "abcd1234" }` and HTTP 200
- [ ] AC3: The Effect.Schema decoder for roster shape rejects a malformed roster object (missing required `workers` field) with a typed decode error — drift protection
- [ ] AC4: `GET /api/agents` returns HTTP 409 when `roster.json` is absent (daemon not running)
- [ ] AC5: The pure adapt core function `stateToAgentRow` maps `state: "working"` → group `"working"`, `state: "blocked"` → group `"needs-input"`, `state: "completed"` → group `"completed"`, `state: "failed"` → group `"completed"`, `state: "stopped"` → group `"completed"`
- [ ] AC6: The frontend panel renders three section headings ("Needs input", "Working", "Completed") when given a representative `AgentRow[]`
- [ ] AC7: Each agent row in the frontend panel has an "Attach" button that, when clicked, opens the zellij iframe with `claude attach <id>` as the launch command

## Context

- Depends on spec 011 (zellij iframe) for the attach surface
- `~/.claude/daemon/roster.json` shape: `{ workers: Record<shortId, { pid, sessionId, cwd, cliVersion, ... }> }`
- `~/.claude/jobs/<short>/state.json` states: `working | blocked | completed | failed | stopped | idle`
- `~/.claude/jobs/<short>/timeline.jsonl` is append-only
- `claude --bg "<prompt>"` prints `backgrounded · <8-hex-short>` on stdout
- Installed CLI version: 2.1.140 (minimum required: 2.1.139)
- Reuse `platform/sse-bus.ts` for SSE push; reuse `features/zellij` for iframe attach surface
