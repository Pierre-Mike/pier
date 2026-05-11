# Design — 041 palette-file-search

## Approach

Three parallel workstreams that converge at the palette wiring:

1. **Backend** — add `searchFiles(projectId, query, limit)` to `RepoService` + `makeRepoServiceTest`.
   Wire a new `GET /api/projects/:id/files/search` route handler.

2. **Palette** — remove `files` from `StoreSnapshot`; add `fetchFileResults` to `PaletteDeps`;
   add `setSearchResults` to `PaletteHandle` (test-injection point); wire debounce + AbortController.

3. **Sidebar** — delete `store.files`, `store.fileFilter` from types/state; remove `#file-filter`
   from `ArtifactsPane.astro`; remove `fileFilter` branch from `refreshFiles`.

## Files touched

- `apps/backend/src/features/projects/projects.files.repo.ts` — add `searchFiles` to interface + live + test layers
- `apps/backend/src/features/projects/projects.routes.ts` — add `GET /api/projects/:id/files/search` handler + route mount
- `apps/frontend/src/dashboard/palette.ts` — remove `files` from `StoreSnapshot`; add `fetchFileResults` dep; add `setSearchResults` on handle; wire search + clear logic
- `apps/frontend/src/dashboard/types.ts` — remove `files: FileEntry[]` and `fileFilter: string` from `DashboardState`
- `apps/frontend/src/dashboard/state.ts` — remove `files` and `fileFilter` from initial state
- `apps/frontend/src/dashboard/files.ts` — remove `fileFilter` branch from `refreshFiles`; remove `store.files` references; remove `wireFileTreeUI` filter handler
- `apps/frontend/src/components/ArtifactsPane.astro` — remove `<input id="file-filter">` element

## Decisions

- **Decision 1: Substring match server-side** — `path.toLowerCase().includes(q.toLowerCase())`.
  No dependency, one line, replaceable in a future spec. Empty `q` short-circuits to `[]`.

- **Decision 2: Delete `store.files` / `store.fileFilter` entirely** — post-spec nothing reads them.
  Verified by `grep -r 'store\.files\|fileFilter' apps/frontend/src` returning zero production hits.

- **Decision 3: `git ls-files` per request** — matches spec 040 pattern; avoids cache invalidation;
  <100ms on large repos, below 150ms debounce window.

- **Decision 4: `setSearchResults` on PaletteHandle** — test-injection point that avoids needing
  async test timers. The production path calls `fetchFileResults` and then calls `setSearchResults`
  internally. Tests can call `setSearchResults` directly to simulate resolved fetches.

## Risks

- `files.test.ts` has tests that reference `store.fileFilter` and `store.files` — those assertions
  must be deleted when the fields are removed (both fields are the "spec 040 AC6" tests that check
  the filter branch; that branch is removed here).

## Out of scope

- Fuzzy ranking — substring is sufficient; a future spec can swap the algorithm.
- In-memory cache for `searchFiles` — profiling first.
- Debounce wiring in the Astro component — debounce lives inside `installPalette`.
