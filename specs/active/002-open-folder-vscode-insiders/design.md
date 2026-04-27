# Design

## Approach

Extract a pure `vscodeFolderUrl(projectsRoot, projectId)` helper from the folder-URL construction logic in `viewer.ts`, export it for unit testing, then insert a `Folder ↗` anchor into the existing `viewer-head` template literal between the current `VSCode ↗` and `open ↗` anchors. The helper trims any trailing slash from `projectsRoot`, guarantees a leading `/`, and returns `vscode-insiders://file/<root>/<projectId>`. When `projectsRoot` is undefined it falls back to `vscode-insiders://file/<projectId>`. No new CSS, no backend changes.

## Files touched

- `apps/frontend/src/dashboard/viewer.ts` — add exported `vscodeFolderUrl` helper; insert `Folder ↗` anchor in viewer-head bar
- `apps/frontend/src/dashboard/viewer.test.ts` — new unit test file (gate)
- `scripts/smoke-002-viewer-folder-url.ts` — new e2e smoke script (gate)

## Decisions

- **Add a second link, do NOT replace** the existing single-file `VSCode ↗`. Both flows are kept; the new `Folder ↗` anchor is inserted between `VSCode ↗` and `open ↗`.
- **URL scheme**: bare `vscode-insiders://file/<abs-folder-path>` (no `vscode.openFolder` command URI, no query string). VS Code interprets a directory path on the `file` scheme as "open folder."
- **Path encoding**: match existing un-encoded behavior in `viewer.ts:91` — do not URL-encode path components. Asymmetry between the two adjacent anchors would be worse than matching.

## Out of scope

- URL encoding for either the new or the existing anchor.
- Replacing the existing single-file `VSCode ↗` link.
- Backend changes of any kind.
- New CSS classes or style changes.
