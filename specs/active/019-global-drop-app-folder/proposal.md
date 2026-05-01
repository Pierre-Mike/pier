---
id: 019-global-drop-app-folder
title: Global drag-and-drop saves files to pier app drops folder
status: active
kind: code
gate:
  - path: apps/backend/src/features/drops/drops.routes.test.ts
    level: unit
  - path: apps/backend/src/features/drops/drops.repo.test.ts
    level: integration
created: 2026-05-01
owner: main
depends_on:
  - 007-drop-injects-terminal-path
  - 017-wire-settings-modal
supersedes: null
---

## Intent

Replace the per-project drop endpoint with a global one that saves dropped files into pier's own runtime root (`<appRoot>/drops/`) and injects the absolute path into the active terminal session. Users can hand a local file to whichever CLI command is currently focused without manually copying paths from Finder. The Settings modal gains a "Drops" panel that lists everything in the folder with copy-path buttons.

## Constraints

- `POST /api/drops` accepts multipart `files[]` plus form field `activeProjectId`; returns `[{ name, path, size, injected }]` per file.
- `GET /api/drops` returns `[{ name, path, size, mtime }]` sorted newest first.
- `activeProjectId` missing → 400 `{ error: "no active project" }`.
- Saved paths are absolute under `<appRoot>/drops/`; `appRoot` is resolved via marker-walk from `import.meta.url` with `process.cwd()` fallback; `PIGUY_APP_ROOT` env overrides.
- Injected text is shell-quoted paths joined by spaces with a trailing space, via existing `shellQuote` helper.
- 100 MB per-file cap enforced; files exceeding it return 400.
- The old per-project drop endpoint (`POST /api/projects/:id/drop`) is removed entirely.
- No `any`, no `as` casts outside test files (constitution §5).
- `DropsService` is an Effect Context tag exposing `saveDropped` and `listDropped`.

## Acceptance criteria

- [ ] `POST /api/drops` saves a file and returns `{ name, path, size, injected }` with `path` rooted under `<appRoot>/drops/`.
- [ ] `POST /api/drops` calls `TerminalSessions.writeChars` with shell-quoted path(s) plus a trailing space.
- [ ] `POST /api/drops` with a file name containing spaces produces single-quoted shell text.
- [ ] `POST /api/drops` with two files produces a single `writeChars` call with both paths space-joined and a trailing space.
- [ ] `POST /api/drops` missing `activeProjectId` returns 400 `{ error: "no active project" }`.
- [ ] `POST /api/drops` with `writeChars` returning `{ injected: false }` still returns 200 with `injected: false` in the payload.
- [ ] `GET /api/drops` returns an array sorted newest-first with `{ name, path, size, mtime }` per entry.

## Context

- Spec 007 (`2026-04-28-007-drop-injects-terminal-path`): introduced `TerminalSessions.writeChars`.
- Spec 017 (`2026-04-28-017-wire-settings-modal`): introduced the Settings modal wiring.
- Prior art: `apps/backend/src/features/projects/projects.drop.routes.ts` (to be deleted).
