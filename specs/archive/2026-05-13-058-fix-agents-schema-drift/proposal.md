---
id: 058-fix-agents-schema-drift
title: Fix agents schema drift for roster decode
status: archived
kind: code
gate:
  - path: apps/backend/src/features/agents/agents.schema.test.ts
    level: unit
  - path: apps/backend/src/features/agents/agents.schema.integration.test.ts
    level: integration
created: 2026-05-13T00:00:00.000Z
owner: main
depends_on:
  - 056-agent-view-mirror
supersedes: null
archived: '2026-05-13'
---

## Intent

The current `WorkerEntrySchema` in `agents.schema.ts` types `dispatch` and `seed` as `Schema.String`, but the real `~/.claude/daemon/roster.json` contains these as nested objects. This causes every real worker entry to fail decode silently — the failure is folded into `DaemonAbsent → 409` instead of a distinct 502. This spec fixes the schema permissiveness, re-authors the fixture to match the real roster shape, splits the error response tags (`DaemonAbsent` vs `DaemonRosterUnreadable`), and adds a live-drift integration test that proves the schema accepts the real roster without drift.

## Constraints

- Keep `pid: Number`, `sessionId: String`, `cwd: String`, `cliVersion: String` strict (the slice reads these).
- For `dispatch`, `seed`, `rendezvousSock`, `ptySock`, `procStart`, `startedAt`, `attempt`, `respawnFlags`: use `Schema.optional(Schema.Unknown)` — tolerates whatever the CLI emits.
- `DaemonAbsent` tag kept for roster-file-absent case → 409 with `"daemon not running"`.
- New `DaemonRosterUnreadable` tag for decode-failed case → 502 with `{ error: "roster shape unrecognized — check CLI version", details: <decode error message> }`.
- No `any`, no `as` outside tests, no new endpoints, no frontend changes.
- Spec 056 integration test (`agents.routes.integration.test.ts`) must still pass.

## Acceptance criteria

- [ ] `decodeRoster` succeeds on the real `~/.claude/daemon/roster.json` (live-drift check; skipped if file absent).
- [ ] `decodeRoster` succeeds on the updated `__fixtures__/roster.fixture.json` (regression guard; always runs).
- [ ] `GET /api/agents` returns 409 `{ error: "daemon not running" }` when roster file is absent.
- [ ] `GET /api/agents` returns 502 `{ error: "roster shape unrecognized — check CLI version", details: <string> }` when roster file is present but decode fails.
- [ ] `GET /api/agents` returns 200 `AgentRow[]` when roster decodes successfully.

## Context

- Spec 056 archived the original agents route implementation. This is a fix-forward on main.
- Real roster shape verified from `~/.claude/daemon/roster.json` (15.3K, cliVersion 2.1.140).
- `dispatch` is a nested object with fields: `proto`, `short`, `nonce`, `sessionId`, `createdAt`, `source`, `cwd`, `launch`, `env`, `isolation`, `respawnFlags`, `agent`, `seed`, `cols`, `rows`.
- `seed` is nested inside `dispatch` in the real roster (not a top-level worker field).
- Effect Schema is non-strict by default (extra fields tolerated) — the struct only needs to declare fields the slice reads.
