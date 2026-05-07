---
id: 024-gitignored-files-muted-color
title: Show gitignored files with muted color in file tree
status: archived
kind: code
gate:
  - path: apps/backend/src/features/projects/projects.files.repo.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/files.test.ts
    level: integration
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-07'
---

## Intent

The project file-tree currently hides gitignored files entirely. The user wants to see all files in the tree but have gitignored ones visually de-emphasized (muted / dimmed color) so they can distinguish tracked files from ignored ones at a glance without losing visibility of ignored files entirely. The backend `RepoFile` type gains an `ignored: boolean` field (annotated via `git ls-files -i`) and the frontend renders ignored entries with a dedicated CSS class (`tree-file--ignored`).

## Constraints

- The backend must include gitignored files in the `listFiles` response rather than filtering them out.
- Each `RepoFile` entry must carry `ignored: boolean` (not optional — defaults to `false` for tracked files, `true` for ignored).
- The frontend `FileEntry` type must expose `ignored?: boolean`.
- The frontend `renderFileTree` must add the class `tree-file--ignored` to `<li>` elements for ignored entries.
- No new runtime npm dependencies.
- API response shape change is additive (backward-compatible).
- No per-file subprocess spawning in hot paths; use batch `git ls-files -i` to detect ignored files.
- Non-goal: filtering ignored files out (the existing filter input still works on path strings, not ignored status).
- Non-goal: per-directory ignored indicators.

## Acceptance criteria

- [ ] AC1: `RepoFile` type has `ignored: boolean` field.
- [ ] AC2: `makeRepoServiceTest` accepts fixture entries with `ignored: boolean` and `listFiles` returns them with the correct `ignored` value.
- [ ] AC3: A fixture with `ignored: true` is returned as-is by `listFiles`; a fixture with `ignored: false` is also returned correctly.
- [ ] AC4: The frontend `FileEntry` type (in `types.ts`) includes `ignored` field.
- [ ] AC5: The source of `files.ts` adds the CSS class `tree-file--ignored` to `<li>` elements whose `FileEntry` has `ignored: true`.
- [ ] AC6: Non-ignored files do NOT receive the `tree-file--ignored` class.

## Context

Related to the original user intent: "I don't want to hide from the artifact, the gitignore file, But I prefer to have them color coded text." Tracked in spec 024.
