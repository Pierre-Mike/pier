---
id: 041-palette-file-search
title: Move file search to the palette and simplify the sidebar
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/palette.test.ts
    level: unit
  - path: apps/backend/src/features/projects/projects.files.repo.test.ts
    level: integration
created: 2026-05-11
owner: main
depends_on: ["040-lazy-load-file-tree"]
supersedes: null
---

## Intent

Move all file-finding responsibility from the sidebar into the double-shift command palette.
The palette becomes the only surface for searching files in the active project: typing a query
fetches matching files from a new backend search endpoint, debounced at 150 ms with AbortController.
The sidebar's `#file-filter` input and the associated `store.files` / `store.fileFilter` state are
removed entirely; the sidebar remains a pure folder browser (spec 040 lazy tree, unchanged).

## Constraints

- `store.files` and `store.fileFilter` must be deleted from `DashboardState`, `state.ts`, and
  `files.ts`.  No production code may read them after this spec.
- The `<input id="file-filter">` element must be removed from `ArtifactsPane.astro`.
- Backend: `RepoService.searchFiles(projectId, query, limit)` is the only new method added.
  `listFilesInPrefix` from spec 040 is preserved unchanged.
- Palette local state holds `searchResults: ReadonlyArray<PaletteEntry>` — NOT in `store`.
- Debounce 150 ms; abort in-flight requests via `AbortController` on new keystroke.
- Empty or missing `q` returns `{ files: [] }` from the backend (no git invocation).
- Substring match, case-insensitive. Default limit 50, max 200.
- No new npm/bun dependencies.
- `openViewer(projectId, path)` contract unchanged.

## Acceptance criteria

- [ ] AC1  `RepoService.searchFiles(projectId, query, limit)` exists and returns files whose path
        contains `query` (case-insensitive substring). Empty query returns `[]`.
- [ ] AC2  Backend respects `limit`: returns at most `limit` results; default 50, max 200.
- [ ] AC3  `installPalette` no longer sources `files` from `getStore()` / `StoreSnapshot.files`.
        With empty query, `getEntries("")` returns only project entries.
- [ ] AC4  `PaletteDeps` exposes a `fetchFileResults` async function; the palette calls it
        (debounced 150 ms, AbortController cancels in-flight) when query is non-empty.
- [ ] AC5  Results from `fetchFileResults` are merged after project entries in `getEntries`.
- [ ] AC6  `searchResults` cleared on: palette close (`esc()` / `dispose()`) and empty query.
- [ ] AC7  `store.files` and `store.fileFilter` do not appear in `DashboardState` (types.ts source
        check) and are absent from `state.ts`.
- [ ] AC8  `files.ts` `refreshFiles` no longer contains the `fileFilter` branch; no reference to
        `store.fileFilter` or `store.files` remains in `files.ts`.
- [ ] AC9  `ArtifactsPane.astro` does not contain `#file-filter` or `file-filter`.

## Context

Spec 039 added snapshot-identity memoisation to the palette. Spec 040 added lazy folder browsing
in the sidebar. This spec completes the split: sidebar = folder browser, palette = file search.
Depends on spec 040 because `listFilesInPrefix` in the sidebar must remain wired after the
flat-file search path is removed.
