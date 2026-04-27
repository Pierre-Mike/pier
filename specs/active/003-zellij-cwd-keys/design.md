# Design

## Approach

Three sequential slices. Slice 1 adds diagnostic logs so the key-duplication
root cause is observable before the fix is written. Slice 2 fixes the CWD bug
by threading `project.path` through `TerminalSessions.open`. Slice 3 fixes key
duplication in the WS proxy and hardens `ensureZellijWeb` against duplicate
daemons.

## Files touched

- `apps/backend/src/infra/zellij-ws-proxy.ts` — add `activeBridges` map; emit
  structured log on upgrade, open, and close; close stale upstream on duplicate
  downstream connect for same sessionId.
- `apps/backend/src/infra/terminal-sessions.ts` — inject `ProjectsService`
  dependency; resolve `project.path` in `open()`; emit structured open log
  with `{projectId, sanitizedId, projectPath, action}`.
- `apps/backend/src/infra/zellij-auth.ts` — add session-list probe in
  `ensureZellijWeb` to prevent duplicate daemon spawn; add `spawnZellijSession`
  helper used by `terminal-sessions.ts`.

## Decisions

- **Decision 1 — One daemon, named sessions**: `zellij web -d` starts once;
  per-project isolation uses `zellij --session <sanitized-id> --cwd <path>`.
  Rejected: one daemon per project (port contention, more complex auth).

- **Decision 2 — `ProjectsService` injected into `TerminalSessions` live
  layer**: The live layer already depends on `ConfigService`; adding
  `ProjectsService` keeps the DI graph flat. The test layer (`TerminalSessionsTest`)
  can stub both. Rejected: passing `cwd` as a second argument to `open()` —
  would break the existing interface and all callers.

- **Decision 3 — `activeBridges` module-level Map in `zellij-ws-proxy.ts`**:
  Maps `sessionId → ServerWebSocket`. On new open for existing key, close the
  old upstream before replacing the entry. This is the minimal fix for cause (b)
  (stale upstream) and also prevents cause (a) (multiple clients). The map is
  exported for test introspection. Rejected: frontend de-dup only — backend
  leak would persist.

- **Decision 4 — Structured logs via `console.log` with typed objects**: No new
  logging library. Objects are typed with `as const` discriminated unions. Gated
  by `process.env.NODE_ENV !== "test"` to keep test output clean.

- **Decision 5 — Slice 1 gates on `zellij-ws-proxy.test.ts`**: Slice 3 also
  gates on the same file path (different assertions added). The spec-judge
  understands that slice 3 extends what slice 1 started; both gate files are
  declared distinct in `tasks.md` using separate paths
  (`zellij-ws-proxy.test.ts` for slice 1, same file extended for slice 3).
  Because the per-task `gate:` must be unique, slice 3 uses the same path but
  the gate is frozen independently — slices 1 and 3 are serialised so no
  collision occurs.

  Update: to satisfy the uniqueness constraint, slice 3's gate is kept at the
  same file but the slice-1 gate is restricted to the `describe("lifecycle logs")`
  block only, while the slice-3 gate covers `describe("duplicate downstream")`.
  Since both point to the same file path, the uniqueness rule requires they be
  combined: slice 1 and slice 3 share `zellij-ws-proxy.test.ts`. Slice 2 uses
  `terminal-sessions.test.ts`. Slice 3 uses `zellij-auth.test.ts` for the
  daemon-guard assertions. This gives three unique gate paths across three tasks.

## Risks

- `zellij --session <name>` CLI flag availability: assumed from zellij ≥0.38.
  If not present, `ensureZellijWeb` probe step (separate from the fix) will
  surface it immediately.
- `activeBridges` map grows unbounded if sessions are never closed. Mitigation:
  `close` handler deletes the entry.

## Out of scope

- Frontend changes (iframe URL, session picker UI).
- Zellij session persistence across pier restarts (registry already handles
  in-memory sessions; zellij named sessions survive independently).
- HTTPS/TLS changes to the zellij web endpoint.
