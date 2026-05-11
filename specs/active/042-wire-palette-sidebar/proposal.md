---
id: 042-wire-palette-sidebar
title: Wire palette-sidebar page composition
status: active
kind: workflow
gate: scripts/smoke-042-wire-palette-sidebar.ts
created: 2026-05-11
owner: main
depends_on: ["041-palette-file-search"]
supersedes: null
---

## Intent

Spec 041 (PR #58, commit 3e1a302) moved file search into the palette and
simplified the sidebar, but left three wiring gaps at the page-composition
layer in `index.astro` and `files.ts`:

1. `refreshFiles` populates the `folderChildrenCache` but never calls
   `renderFileTree()` afterward, so the sidebar stays blank after a project
   switch.
2. `installPalette` is called without `fetchFileResults`, so the palette never
   searches files — the hook for file-search results is wired to nowhere.
3. A dead `files: store.files` token remains inside the `getStore()` closure
   (the `files` field was removed from `DashboardState` in spec 041), causing
   a TypeScript error and runtime noise.

This spec closes all three gaps and adds a DOM-level test to `files.test.ts`
that verifies the refreshFiles → renderFileTree wiring end-to-end.

## Constraints

- Fix only the three wiring gaps listed; no unrelated refactors.
- `fetchFileResults` must use the existing typed Hono client (`api` from
  `../api`), call `/api/projects/:id/files/search`, be abort-aware
  (honour the `AbortSignal`), map `{ files: FileEntry[] }` responses to
  `PaletteEntry[]` of `kind: "file"` with `label`, `_id`, and `_path`.
- Use `store.activeProject` as the project id; return `[]` when it is null.
- No new npm dependencies.
- API response shape is unchanged.

## Acceptance criteria

- [ ] `refreshFiles` in `files.ts` calls `renderFileTree()` after the
      `await fetchFolderChildren(projectId, "")` line.
- [ ] `installPalette({…})` in `index.astro` receives a `fetchFileResults`
      arrow function that references `/api/projects/:id/files/search` (or the
      equivalent typed-client path) and is abort-aware.
- [ ] `getStore()` in `index.astro` does NOT contain `files: store.files`.
- [ ] `apps/frontend/src/dashboard/files.test.ts` contains a new spec-042
      DOM-level test that calls `refreshFiles`, stubs the fetch layer, and
      asserts the sidebar renders real entries (not the empty placeholder).
- [ ] `bun test apps/frontend/src/dashboard/files.test.ts` passes.

## Context

- Spec 041 PR: #58, commit 3e1a302
- palette.ts `PaletteDeps.fetchFileResults` interface: `apps/frontend/src/dashboard/palette.ts` line 69
- Search backend route: `GET /api/projects/:id/files/search` → `{ files: [...] }`
