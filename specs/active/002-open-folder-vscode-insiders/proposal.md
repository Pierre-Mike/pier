---
id: "002"
title: Open project folder in VS Code Insiders from artifact viewer
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/viewer.test.ts
    level: unit
  - path: scripts/smoke-002-viewer-folder-url.ts
    level: e2e
created: 2026-04-27
owner: main
depends_on: []
supersedes: null
---

## Intent

Users must be able to open an artifact's whole project folder in VS Code Insiders directly from the artifact panel — so they can jump from "I see this artifact" to "I'm editing its full project context" in one click, without manually running `code-insiders <path>` in a terminal.

## Constraints

- Single production file touched: `apps/frontend/src/dashboard/viewer.ts` only. No backend changes.
- No new CSS — new anchor uses same styling as the adjacent `VSCode ↗` anchor.
- No URL encoding of path components — match existing un-encoded behavior in `viewer.ts` line 91. Asymmetry between adjacent anchors is worse than matching.
- `vscodeFolderUrl` must be a pure, exported function for unit-testability.
- The new `Folder ↗` anchor is inserted between existing `VSCode ↗` and `open ↗` — both existing anchors are kept.

## Acceptance criteria

- [ ] `vscodeFolderUrl` is exported from `apps/frontend/src/dashboard/viewer.ts`
- [ ] `vscodeFolderUrl("/srv/projects/", "alpha")` returns `"vscode-insiders://file/srv/projects/alpha"`
- [ ] Trailing-slash-tolerant on `projectsRoot`
- [ ] Returns `"vscode-insiders://file/<projectId>"` when `projectsRoot` is undefined
- [ ] Viewer header bar in `viewer.ts` renders an anchor with text `Folder ↗`, `title="Open project folder in VSCode Insiders"`, `href` from `vscodeFolderUrl`, placed between the existing `VSCode ↗` and `open ↗` anchors
- [ ] `bun test apps/frontend/src/dashboard/viewer.test.ts` passes

## Context

Add a second link in the existing artifact viewer header bar — next to the current single-file `VSCode ↗` — that opens the **project root folder** in VS Code Insiders via the `vscode-insiders://file/<abs-folder-path>` URL scheme. VS Code interprets a directory path on that scheme as "open folder," so no extra protocol/handler is needed. The folder path is already derivable from `appConfig.projectsRoot + projectId` (the same prefix `absoluteRepoPath()` uses).

The artifact viewer header bar lives in `apps/frontend/src/dashboard/viewer.ts` — it already renders three anchors (`VSCode ↗`, `open ↗`, `download`). The new link is inserted between `VSCode ↗` and `open ↗`.
