---
id: 010-double-shift-palette
title: Double-shift command palette for projects and files
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/palette.test.ts
    level: unit
  - path: scripts/smoke-010-palette-dispatch.ts
    level: e2e
created: 2026-04-29T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-29'
---

## Intent

Pier needs a global command palette triggered by a double-tap of the Shift key (≤300ms) so users can jump to any project or file in the active project without navigating the sidebar. The palette opens a centered overlay with a single fuzzy-ranked list of projects and active-project files; selecting an entry reuses the existing `selectProject` / `openViewer` code paths. When focus is inside the Zellij terminal iframe (cross-origin), a postMessage relay forwards Shift keydowns to the parent window so the gesture is detected there too.

## Constraints

- Trigger: two `keydown` events where `e.key === "Shift"`, within 300ms, with no intervening non-Shift keydown; ignore if any modifier (ctrl/meta/alt) is set on either event.
- Toggle: when the palette is already open, another Shift,Shift closes it.
- Terminal iframe workaround: Zellij runs in a cross-origin iframe; a relay script on the iframe wrapper page forwards `{type:"palette-shift-tap", t:<timestamp>}` via `postMessage`; the parent palette listener treats relayed messages identically to native keydowns.
- Entry list: projects first (alphabetical) then files of the active project only — no cross-project file scan.
- Selection: Enter on a project row → `close()` then `selectProject(id)`; Enter on a file row → `close()` then `openViewer(activeProjectId, path)`.
- Mouse click on a row behaves identically to Enter.
- Esc and a second Shift,Shift both close the palette.
- No new backend artifact route; data comes from `store.projects` and `store.files`.
- Non-goals: cross-project file scan, persistence of recent picks, customizable gesture.

## Acceptance criteria

- [ ] Two Shift keydowns within 300ms (no intervening key, no modifier) opens the palette.
- [ ] Two Shift keydowns more than 300ms apart does NOT open the palette.
- [ ] An intervening non-Shift keydown between the two Shift presses resets the state machine.
- [ ] A Shift keydown with ctrl/meta/alt set is ignored (does not count toward the gesture).
- [ ] While the palette is open, a second Shift,Shift closes it (toggle).
- [ ] A `postMessage` with `{type:"palette-shift-tap"}` from a child iframe is treated identically to a native Shift keydown by the state machine.
- [ ] Pressing Enter on a project row calls `selectProject(id)` after `close()`.
- [ ] Pressing Enter on a file row calls `openViewer(activeProjectId, path)` after `close()`.
- [ ] Pressing Esc closes the palette.
- [ ] Fuzzy filter ranks entries containing the query substring above those that do not.

## Context

- `selectProject` lives at `apps/frontend/src/dashboard/projects.ts:95`.
- `openViewer` lives at `apps/frontend/src/dashboard/viewer.ts`.
- Store shape: `store.projects: Project[]`, `store.files: FileEntry[]`, `store.activeProject: string | null`.
- The Zellij iframe wrapper is served by the backend route at `apps/backend/`; the relay snippet (≈15 lines) is injected there.
- Related: spec 007 (drop injects into terminal) for prior postMessage patterns avoided.
