# Design

## Approach

Two-part change: backend adds `listFilesInPrefix` to `RepoService`; frontend replaces the eager full-fetch with a lazy per-folder fetch.

**Backend** — `projects.files.repo.ts`:
- Add `ChildEntry = { path: string; isDir: boolean; ignored: boolean }` export.
- Add `listFilesInPrefix(projectId: string, prefix: string): Effect<ChildEntry[], RepoError>` to the `RepoService` interface.
- Live implementation: derive immediate children from the existing flat `listProjectFiles` result. For each file path, strip the prefix, take the first path segment — if it contains a `/` further down, it's a sub-directory; otherwise it's a file. Deduplicate directory entries. A directory entry is `ignored: true` if ALL its descendant files are ignored.
- Test layer (`makeRepoServiceTest`): same derivation from the fixture map, so tests don't need to pre-compute children manually.

**Frontend** — `files.ts`:
- Export `folderChildrenCache: Map<string, ChildEntry[]>` (per-folder; keyed by folder path relative to project root, empty string = root).
- Export `fetchFolderChildren(projectId: string, folderPath: string): Promise<ChildEntry[]>` — calls `GET /api/projects/:id/files?prefix=<folderPath>`, stores result in `folderChildrenCache`, returns it.
- Update `refreshFiles(projectId)`: when `store.fileFilter` is empty, fetch root children via `fetchFolderChildren` instead of all files. Clear `folderChildrenCache` on project change.
- Update `renderFileTree`: when filter is empty, render from `folderChildrenCache` (lazy); when filter is non-empty, fetch all files (existing `store.files` path) so the filter can scan everything.
- Update folder-expand click handler: on expand, call `fetchFolderChildren` for the expanded folder if not already in cache.

**Backend route** — `projects.routes.ts`:
- `GET /api/projects/:id/files` now reads an optional `?prefix` query parameter. If present, calls `repo.listFilesInPrefix(id, prefix)` and returns `{ files: ChildEntry[] }`. If absent, falls back to existing `repo.listFiles(id)` returning `{ files: RepoFile[] }`. The response shape stays `{ files: [...] }` so existing callers don't break.

## Files touched

- `apps/backend/src/features/projects/projects.files.repo.ts` — add `ChildEntry` type, `listFilesInPrefix` to interface + live impl + test helper.
- `apps/backend/src/features/projects/projects.routes.ts` — wire `?prefix` query param to `listFilesInPrefix`.
- `apps/frontend/src/dashboard/files.ts` — add `folderChildrenCache`, `fetchFolderChildren`, update `refreshFiles` and `renderFileTree`.
- `apps/frontend/src/dashboard/files.test.ts` — gate (RED already added).
- `apps/backend/src/features/projects/projects.files.repo.test.ts` — gate (RED already added).

## Decisions

- **Derive children from flat list, not a new git call** — avoids a second `git ls-files` round-trip; the live layer can cache the flat list and slice it.
- **folderChildrenCache as module-level Map** — simpler than adding it to `DashboardState` (avoids a reactive store mutation for every folder expand); cleared on project change.
- **`isDir` for a directory entry is inferred, not stored** — a path segment that is a prefix of other paths is a directory. No `.gitattributes` or `stat` needed.
- **A dir entry is `ignored: true` iff all its children are ignored** — consistent with `git ls-files` semantics; partial-ignore dirs show as non-ignored.
- **`?prefix` on existing route** — avoids adding a new route path; backward-compatible since `prefix` defaults to empty = full list.

## Risks

- Bun/happy-dom module caching in tests: the `files.ts` module is imported once per test file; `folderChildrenCache` is module-level so tests must clear it between cases. Mitigated by using `beforeEach` in the DOM tests.

## Out of scope

- Cache invalidation on file-system watch events.
- Virtualised/windowed rendering of large directory listings.
- Pagination of `listFilesInPrefix` results.
