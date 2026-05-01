# Design

## Approach

Replace the per-project drop pipeline with a global one. A new `drops` feature module exposes `POST /api/drops` and `GET /api/drops`. Files land in `<appRoot>/drops/` (pier's own checkout root), and the absolute path is injected into the active terminal session via the existing `TerminalSessions.writeChars`. The frontend drops widget and settings panel are wired to the new endpoints.

## Files touched

### Backend — new
- `apps/backend/src/features/drops/drops.helpers.ts` — `sanitizeDropName`, `uniqueDropPath`, `MAX_DROP_BYTES` (extracted from `projects.files.repo.ts`).
- `apps/backend/src/features/drops/drops.repo.ts` — `DropsService` Context tag with `saveDropped(files)` and `listDropped()`.
- `apps/backend/src/features/drops/drops.repo.test.ts` — unit tests for `DropsService`.
- `apps/backend/src/features/drops/drops.routes.ts` — Hono route module: `POST /api/drops`, `GET /api/drops`. Exports `dropsPostHandler`, `dropsGetHandler`, `dropsRoute`.
- `apps/backend/src/features/drops/drops.routes.test.ts` — **gate file** (RED, authored by spec-tester).

### Backend — modified
- `apps/backend/src/platform/config.repo.ts` — add `appRoot: string` to `PiguyConfig`; resolve via marker-walk with `PIGUY_APP_ROOT` override.
- `apps/backend/src/shell/api.ts` — register `dropsRoute`, remove `projectsDropRoute`.
- `.dependency-cruiser.cjs` — remove per-project drop allowlist entry.

### Backend — deleted
- `apps/backend/src/features/projects/projects.drop.routes.ts`
- `apps/backend/src/features/projects/projects.drop.routes.test.ts`
- `saveDropped` method removed from `apps/backend/src/features/projects/projects.files.repo.ts`.

### Frontend — modified
- `apps/frontend/src/dashboard/drop.ts` — post to `/api/drops`, include `activeProjectId` in FormData; remove post-upload `refreshFiles` call.
- `apps/frontend/src/dashboard/drop.test.ts` — update fixtures.
- `apps/frontend/src/dashboard/settings.ts` — add "Drops" tab + panel; `GET /api/drops` → render rows with copy-path buttons.
- `apps/frontend/src/dashboard/settings.test.ts` — add Drops-tab coverage.

## Decisions

- **`appRoot` resolution** — marker-walk from `import.meta.url` looking for `pier-architecture.canvas` or `package.json` with `"name": "pier"`; fallback to `process.cwd()`; `PIGUY_APP_ROOT` env override wins. Avoids hardcoding and works in test environments.
- **Delete per-project drop endpoint** — only one drop surface; simpler mental model; drops folder is pier-global, not per-project.
- **`drops/` placement** — `<appRoot>/drops/` with self-contained `.gitignore` (`*\n!.gitignore\n`). Created lazily on first drop.
- **Shell-quoting** — reuse the `shellQuote` helper already in `projects.drop.routes.ts`. Paths with special characters get single-quoted; safe paths are unquoted.
- **POST response shape** — per-file array: `[{ name, path, size, injected }]`. `injected` reflects the `writeChars` result (true/false). 200 even when injection fails — frontend falls back to clipboard.
- **Missing `activeProjectId`** — hard 400, no silent fallback. Frontend must always send the field.
- **GET response shape** — `[{ name, path, size, mtime }]` newest-first (sort by `mtime` descending). Folder is the history; no separate DB.

## Risks

- `appRoot` marker-walk may fail in unusual CI layouts → `process.cwd()` fallback guarantees something is returned.
- Large drops folders may slow `GET /api/drops` → acceptable at MVP scale; pagination is out of scope.

## Out of scope

- Pagination of `GET /api/drops`.
- Deleting individual drop entries via the API.
- Upload progress indication.
- Per-file 4xx when one file in a batch exceeds the size cap (batch fails atomically for now).
