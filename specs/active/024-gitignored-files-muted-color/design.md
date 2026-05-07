# Design

## Approach

Two-layer change following FCIS architecture:

1. **Backend (unit)**: Add `ignored: boolean` to `RepoFile`. Update `makeRepoServiceLive` to run two git commands: the existing `git ls-files --cached --others --exclude-standard` for all visible files, then `git ls-files -i --others --exclude-standard` to identify ignored files. Annotate each entry. Update `makeRepoServiceTest` to accept `RepoFile` entries with `ignored`.

2. **Frontend (integration)**: Add `ignored?: boolean` to `FileEntry` in `types.ts`. Update `buildTree` node shape and `renderTreeNode` to pass `ignored` down. In the file-rendering loop, append ` tree-file--ignored` to the `<li>` className when `f.ignored` is true.

No new dependencies. The `git ls-files -i` call is batched (single subprocess per `listFiles` call), not per-file.

## Files touched

- `apps/backend/src/features/projects/projects.files.repo.ts` — add `ignored` to `RepoFile`, update `listFiles` live impl and test helper
- `apps/frontend/src/dashboard/types.ts` — add `ignored?: boolean` to `FileEntry`
- `apps/frontend/src/dashboard/files.ts` — propagate `ignored` through `buildTree` TreeNode and `renderTreeNode`, add `tree-file--ignored` class

## Decisions

- **Batch git check**: Use `git ls-files -i --others --exclude-standard` (one subprocess, returns only ignored untracked files). Set-intersect with the full file list to mark `ignored: true`. This avoids per-file `git check-ignore` calls.
- **`ignored: boolean` not `ignored?: boolean` on RepoFile**: Backend type is strict boolean — callers always know the ignored state. Frontend `FileEntry` is `ignored?: boolean` for backward compatibility (existing callers that don't care about ignored state don't break).
- **CSS class approach**: `tree-file--ignored` is a BEM modifier class. The CSS styles this with muted color. No inline styles — easier to theme.
- **Tree node shape**: The `TreeNode` internal `files` array must carry `ignored` to pass it to `renderTreeNode`. Add `ignored: boolean` to the `{ name, path }` shape in the internal interface.

## Risks

- `git ls-files -i` may return paths with different casing on case-insensitive filesystems. Mitigation: use set membership on the full path string as returned by the first call.

## Out of scope

- Filtering by ignored status (the existing filter input remains path-based)
- Per-directory ignored indicators
- Collapsing or grouping ignored files
- Any change to how the blob endpoint serves file contents
