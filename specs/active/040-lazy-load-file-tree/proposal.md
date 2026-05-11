---
id: 040-lazy-load-file-tree
title: Lazy-load file tree on expand and search
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/files.test.ts
    level: unit
  - path: apps/backend/src/features/projects/projects.files.repo.test.ts
    level: integration
created: 2026-05-11
owner: main
depends_on: []
supersedes: null
---

## Intent

The file-tree sidebar currently enumerates every file in a project on load via `GET /api/projects/:id/files`, including non-source and ignored files. On large repos (10k+ files) this makes the sidebar unresponsive for several seconds. Switch to lazy loading: only fetch a folder's direct children when the user expands it. Search remains the primary power-user access path — when a filter query is active, fetch all files so the filter can scan across the full tree.

## Constraints

- The existing `listFiles(projectId)` method on `RepoService` must remain unchanged for backward compatibility.
- No new npm dependencies.
- The existing `/api/projects/:id/files` endpoint keeps its `{ files: FileEntry[] }` response shape (no breaking changes to callers that don't pass `?prefix`).
- Lazy children are cached per directory in the frontend (not stored in `store.files`).
- Search (non-empty `store.fileFilter`) triggers a full-file fetch, not lazy loading — preserving existing search behaviour.
- Performance: root-level children must be computable with a single `git ls-files` call; no recursive stat.
- Non-goal: virtualised/windowed rendering — only the data fetch is lazy.
- Non-goal: cache invalidation strategy (cache is keyed on project load; refresh clears it).

## Acceptance criteria

- [ ] AC1: `RepoService` exposes `listFilesInPrefix(projectId, prefix)` returning `ChildEntry[]` where `ChildEntry = { path: string; isDir: boolean; ignored: boolean }`.
- [ ] AC2: `listFilesInPrefix` with an empty/undefined prefix returns only root-level children (files and directories directly under the repo root).
- [ ] AC3: `listFilesInPrefix` with a non-empty prefix returns only immediate children of that directory (not grandchildren).
- [ ] AC4: `listFilesInPrefix` distinguishes file entries (`isDir: false`) from directory entries (`isDir: true`) in the result.
- [ ] AC5: On folder expand (click), the frontend calls `fetchFolderChildren(projectId, folderPath)` which fetches from the prefix endpoint and stores results in a `folderChildrenCache` (not in `store.files`).
- [ ] AC6: When `store.fileFilter` is non-empty, `refreshFiles` fetches the full flat list (existing behaviour) rather than using the lazy prefix path.
- [ ] AC7: The rendered tree uses `folderChildrenCache` data for expanded folders, not the old flat `store.files` array.

## Context

- Related spec: specs/archive/2026-*-024-show-gitignored-files/ — added `ignored` field to `RepoFile` and `FileEntry`.
- The `projects.files.repo.ts` already has `listProjectFiles` that runs `git ls-files` to get all files. The new `listFilesInPrefix` reuses this approach but filters to immediate children only.
- The frontend `files.ts` currently builds a full in-memory tree from `store.files`. Post-lazy-load, the tree is built incrementally from `folderChildrenCache`.
