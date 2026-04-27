# Design

## Approach

Extract a pure `vscodeFolderUrl(projectsRoot, projectId)` helper and a pure `renderViewerHead(projectId, path, name)` helper from `viewer.ts`. `vscodeFolderUrl` is exported for unit testing. `renderViewerHead` returns the complete `viewer-head` HTML string (the same literal assigned into `viewer.innerHTML` before the viewer-body content), callable synchronously without DOM access or network I/O. `openRepoFile` calls `renderViewerHead` internally instead of inlining the template literal. The `Folder ↗` anchor is inserted between the existing `VSCode ↗` and `open ↗` anchors inside the returned string. No new CSS, no backend changes.

## Files touched

- `apps/frontend/src/dashboard/viewer.ts` — add exported `vscodeFolderUrl` and `renderViewerHead` helpers; insert `Folder ↗` anchor in viewer-head bar; refactor `openRepoFile` to call `renderViewerHead`
- `apps/frontend/src/dashboard/viewer.test.ts` — new unit test file (gate)
- `scripts/smoke-002-viewer-folder-url.ts` — new e2e smoke script (gate)

## Decisions

- **Add a second link, do NOT replace** the existing single-file `VSCode ↗`. Both flows are kept; the new `Folder ↗` anchor is inserted between `VSCode ↗` and `open ↗`.
- **URL scheme**: bare `vscode-insiders://file/<abs-folder-path>` (no `vscode.openFolder` command URI, no query string). VS Code interprets a directory path on the `file` scheme as "open folder."
- **Path encoding**: match existing un-encoded behavior in `viewer.ts:91` — do not URL-encode path components. Asymmetry between the two adjacent anchors would be worse than matching.
- **Pure render helper**: `renderViewerHead` must not reference `store`, `$`, `fetch`, or any DOM API. It receives `projectId`, `path`, and `name` as arguments and derives URLs from `appConfig` (which is a plain object import — not a DOM operation). This keeps the helper synchronous and testable in any JS environment without JSDOM or mocking.
- **e2e gate approach**: the smoke script imports `renderViewerHead` from the compiled/source viewer module, calls it with known inputs, then parses the returned HTML string using regex to: (a) locate the `Folder ↗` anchor, (b) verify its `href` equals `vscodeFolderUrl(appConfig.projectsRoot, projectId)`, (c) verify its `title`, (d) verify its character-index position is strictly after `VSCode ↗` and strictly before `open ↗` in the returned string.

## Out of scope

- URL encoding for either the new or the existing anchor.
- Replacing the existing single-file `VSCode ↗` link.
- Backend changes of any kind.
- New CSS classes or style changes.
