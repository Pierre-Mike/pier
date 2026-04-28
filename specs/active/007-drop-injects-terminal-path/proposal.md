---
id: 007-drop-injects-terminal-path
title: Drag-and-drop injects path into active terminal
status: active
kind: code
gate:
  - path: apps/backend/src/shell/routes/projects-drop.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/drop.test.ts
    level: unit
  - path: scripts/smoke-007-drop-injects-terminal-path.ts
    level: e2e
created: 2026-04-28
owner: main
depends_on: []
supersedes: null
---

## Intent

When a user drops a file onto the pier web UI's terminal area, the file is uploaded to `<project>/.pier/drops/<file>` and the resulting path is injected directly into the active zellij pane via `zellij action write-chars`, replicating native terminal drag-drop UX over a remote connection. If injection fails, the path falls back to clipboard with an explicit toast.

## Constraints

- Storage path moves from `.drops/` to `.pier/drops/` (constant rename in `repo.ts`).
- `TerminalSessions` infra service gains a `writeChars` method; its test layer returns `{ injected: true }`.
- Session ID derived via existing `sessionIdFromProjectId` logic (internal, not re-exported).
- Shell-quoting moves from frontend `drop.ts` to the backend route layer.
- Paths are joined with single spaces, trailing space appended (mirrors macOS Terminal drag-drop).
- On `injected: false`: clipboard fallback + toast naming the failure. Do NOT touch clipboard on success.
- Response shape is `{ files: DroppedFile[], injected: boolean }`, status 200 preserved.
- `Bun.spawn` fire-and-wait with 2 s timeout; non-zero exit → `injected: false`. No throws.

## Acceptance criteria

- [ ] Saved file paths contain `.pier/drops/` not `.drops/`.
- [ ] Response JSON includes `injected` boolean field alongside `files` array.
- [ ] `TerminalSessions.writeChars` is called with shell-quoted, space-joined, trailing-space text when upload succeeds.
- [ ] When `writeChars` returns `injected: false`, response is still 200 with `injected: false`.
- [ ] Frontend toasts "Inserted into terminal: <paths>" on `injected: true`.
- [ ] Frontend toasts "Terminal not reachable — paths copied. ⌘V to paste." and copies to clipboard on `injected: false`.

## Context

See aligned plan in dispatch. Depends on existing `RepoService`, `TerminalSessions`, and `ConfigService` infra services.
