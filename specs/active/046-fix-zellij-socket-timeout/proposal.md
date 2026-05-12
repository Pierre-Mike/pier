---
id: 046-fix-zellij-socket-timeout
title: Fix zellij socket creation timeout
status: active
kind: code
gate:
  - path: apps/backend/src/features/sessions/sessions.repo.test.ts
    level: unit
  - path: apps/backend/src/features/sessions/sessions.routes.integration.test.ts
    level: integration
created: 2026-05-12
owner: main
depends_on: []
supersedes: null
---

## Intent

When a user opens a session for a project whose directory does not exist on disk (e.g., `/Users/pierre-mikel/Github/garde-robe`), `spawnNamedSession` in `sessions.repo.ts` polls `ZELLIJ_SOCKET_DIR/contract_version_1/` for a socket file for 3 seconds. If the socket never appears, it throws a timeout error with empty stderr. The root cause is that zellij silently stalls when spawning in a non-existent cwd. The fix ensures sessions open reliably for all valid project paths, either by pre-validating and creating the cwd, extending the timeout adaptively, or surfacing a clearer error when the cwd is the problem.

## Constraints

- **Backward-compatible error type**: `TerminalError` remains the error type; message text can change
- **No new dependencies**: solve with existing Bun/Effect primitives
- **Performance budget**: socket poll for happy path (cwd exists) remains fast (<500ms typical)
- **3s timeout reference**: either extend it, make it configurable, or add pre-spawn validation that prevents the timeout from ever being hit
- **Must preserve existing test suite**: extend gate files with new tests, do not replace existing tests

## Acceptance criteria

- [ ] When `sessions.open(projectId)` is called for a project whose cwd does not exist on disk, the session opens successfully after the cwd is created OR a clear error is thrown indicating the cwd issue
- [ ] The socket poll timeout is either extended, made adaptive based on cwd existence, or bypassed via cwd pre-validation
- [ ] Error messages for socket timeout failures include actionable context (cwd path, whether it exists, stderr)
- [ ] Existing `sessions.repo.test.ts` tests pass
- [ ] Existing `sessions.routes.integration.test.ts` tests pass
- [ ] New RED tests in both gate files encode the acceptance criteria and fail before implementation

## Context

- Error from user session: `"zellij --session garde-robe did not create a socket within 3s at cwd=/Users/pierre-mikel/Github/garde-robe. stderr: (empty)"`
- `resolveProjectCwd` currently returns `join(projectsRoot, projectId)` unconditionally (spec 036)
- Zellij may silently stall or fail to spawn a PTY when cwd does not exist
- The 3s timeout is hardcoded as 30 iterations × 100ms in the polling loop
