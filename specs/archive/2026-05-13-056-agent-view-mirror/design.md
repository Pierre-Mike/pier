# Design

## Approach

A new backend feature slice `features/agents/` follows the existing FCIS pattern (adapt-core → repo → routes). The slice reads daemon on-disk state, shells the `claude` CLI for actions, and pushes deltas through the existing SSE bus. The frontend grows one vanilla TS panel that mirrors the TUI's three-state grouping and reuses the existing zellij iframe for agent attach.

## Files touched

### Backend — pure core
- `apps/backend/src/features/agents/agents.adapt.core.ts` — pure: `stateToAgentRow(shortId, stateJson) → AgentRow`; maps daemon state strings to display groups (working/needs-input/completed)
- `apps/backend/src/features/agents/agents.adapt.core.test.ts` — unit tests for group mapping (GATE: unit)
- `apps/backend/src/features/agents/agents.schema.ts` — Effect.Schema decoders for roster + state shapes; exports `decodeRoster`, `decodeAgentState`

### Backend — repos
- `apps/backend/src/features/agents/agents.daemon.repo.ts` — Effect service: read roster.json + watch `~/.claude/jobs/**`; exports `AgentDaemon` tag + `AgentDaemonTest` stub
- `apps/backend/src/features/agents/agents.daemon.repo.test.ts` — unit tests for daemon repo
- `apps/backend/src/features/agents/agents.dispatch.repo.ts` — Effect service: spawn `claude --bg`, parse `backgrounded · <shortId>` from stdout; exports `AgentDispatch` tag + `AgentDispatchTest` stub
- `apps/backend/src/features/agents/agents.control.repo.ts` — Effect service: stop/respawn/rm/logs via CLI; exports `AgentControl` tag + `AgentControlTest` stub

### Backend — routes
- `apps/backend/src/features/agents/agents.routes.ts` — Hono routes: `GET /api/agents`, `POST /api/agents`, `GET /api/agents/:id/peek`, `POST /api/agents/:id/stop`, `POST /api/agents/:id/respawn`, `POST /api/agents/:id/delete`; exports `agentsRoute` (RouteModule) and `makeAgentsTestApp` factory
- `apps/backend/src/features/agents/agents.routes.test.ts` — unit-level route tests
- `apps/backend/src/features/agents/agents.stream.routes.ts` — `GET /api/agents/stream` SSE endpoint; uses chokidar + sse-bus
- `apps/backend/src/features/agents/agents.routes.integration.test.ts` — integration tests (GATE: integration)

### Backend — composition root
- `apps/backend/src/api.ts` — register agentsRoute slice so typed AppType propagates to frontend

### Frontend
- `apps/frontend/src/dashboard/agent-view.ts` — vanilla TS panel: render three group sections, SSE subscription, dispatch form, row click → peek panel, "Attach" → zellij iframe with `claude attach <id>`
- `apps/frontend/src/dashboard/agent-view.test.ts` — jsdom tests for panel rendering
- `apps/frontend/src/styles/dashboard.css` — panel CSS (scoped to `.agent-view` prefix; not component-scoped to avoid Astro hash miss)

### Fixtures
- `apps/backend/src/features/agents/__fixtures__/roster.fixture.json`
- `apps/backend/src/features/agents/__fixtures__/state-working.fixture.json`
- `apps/backend/src/features/agents/__fixtures__/state-needs-input.fixture.json`
- `apps/backend/src/features/agents/__fixtures__/state-completed.fixture.json`

## Decisions

- **Group mapping** — `working|idle` → `"working"`, `blocked` → `"needs-input"`, `completed|failed|stopped` → `"completed"`. The TUI uses this same three-bucket model.
- **makeAgentsTestApp factory** — integration tests need an injectable way to substitute roster.json and state.json reads. The routes file exports `makeAgentsTestApp({ rosterJson, stateByShortId, spawnStdout? })` which wires Hono with in-memory stubs instead of fs reads + CLI spawn. This keeps the test boundary at the HTTP layer without exposing internal Effect layers.
- **decodeRoster as Either** — `decodeRoster(raw): { _tag: "Right"; right: ... } | { _tag: "Left"; left: ... }` matches Effect's `Either` encoding, usable in tests without Effect runtime.
- **chokidar** — reuses chokidar already transitively present via features/drops and features/artifacts. No native fs.watch (macOS fsevents quirks).
- **SSE stream** — agentsStream SSE endpoint merges chokidar file-change events and re-reads state.json on every change, emitting `AgentRow` deltas. Uses existing `platform/sse-bus.ts` pattern.
- **Frontend attach** — "Attach" button sets `window.location` or dispatches a custom event to the existing zellij iframe controller with `claude attach <shortId>` as the command. Not write-to-pane (deferred to v2).
- **CLI version gate** — returns 409 with `{ error: "claude CLI < 2.1.139 or daemon not running" }` if roster.json absent or any worker's cliVersion is below minimum.

## Risks

- Daemon state file format may evolve across CLI versions → mitigated by Effect.Schema with explicit required fields + `unknown` passthrough for optional fields
- chokidar watch depth 2 on `~/.claude/jobs/` may miss deeply nested paths → mitigated: `<id>/state.json` and `<id>/timeline.jsonl` are at depth 2, sufficient for v1

## Out of scope

- ptySock unix socket IPC
- PR-status dots on rows
- Inline reply UI (attach-only)
- write-to-pane integration
- Remote-auth hardening for SSE/dispatch endpoints
- E2E browser tests for the panel
