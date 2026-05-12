# Design

## Approach

Pre-create the project cwd directory in `spawnNamedSession` before spawning `zellij --session <id>`. This ensures zellij can always open a PTY with a valid working directory, eliminating the root cause of the 3s socket timeout. If the cwd creation fails (e.g., permission denied), surface that failure immediately as a `TerminalError` with actionable context rather than waiting 3s for a timeout.

## Files touched

- `apps/backend/src/features/sessions/sessions.repo.ts` — add `mkdir -p` call before `Bun.spawn` in `spawnNamedSession`; enhance timeout error message to include cwd existence status
- `apps/backend/src/features/sessions/sessions.repo.test.ts` — add RED tests for AC 1, 2, 3
- `apps/backend/src/features/sessions/sessions.routes.integration.test.ts` — add RED integration tests for HTTP API error handling

## Decisions

- **Pre-create cwd vs extend timeout**: Pre-create cwd. Extending the timeout just delays the inevitable failure when cwd doesn't exist; creating the cwd fixes the root cause. Zellij expects a valid cwd to spawn a PTY.
- **mkdir location**: Call `mkdir` inside `spawnNamedSession` immediately before `Bun.spawn`, not in `resolveProjectCwd`. `resolveProjectCwd` is a pure helper that resolves paths; side effects belong in the spawn function.
- **Error message enhancement**: If the timeout is still hit (disk full, zellij bug), include cwd existence status in the error message. Use `existsSync(cwd)` to check and report `cwd=${cwd} (exists: ${existsSync(cwd)})`.
- **Backward compatibility**: `TerminalError` remains the error type; message text changes are backward-compatible.

## Risks

- **Race condition**: If two concurrent `sessions.open` calls target the same project, both may attempt `mkdir`. Mitigated by `mkdir -p` semantics (idempotent, no error if dir exists).
- **Permission denied**: If the user cannot create the cwd (permission denied), `mkdir` will throw. Catch this and wrap in `TerminalError` with the mkdir error message for immediate actionable feedback.

## Out of scope

- Adaptive timeout based on cwd existence (not needed if cwd is always pre-created)
- Configurable timeout (not requested, and pre-creation makes it unnecessary)
- Zellij health checks or retry logic (out of scope for this spec)
