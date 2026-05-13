---
id: 057-wire-agent-view-mount
title: Wire agent-view mount into dashboard
status: archived
kind: code
gate:
  - path: apps/frontend/src/pages/index.astro.mount.test.ts
    level: unit
  - path: apps/e2e/tests/agent-view-mount.spec.ts
    level: e2e
created: 2026-05-13T00:00:00.000Z
owner: main
depends_on:
  - 056-agent-view-mirror
supersedes: null
archived: '2026-05-13'
---

## Intent

Spec 056 shipped `mountAgentView(container: HTMLElement)` in `apps/frontend/src/dashboard/agent-view.ts` but never wired it into the page. The function is exported but never imported or called — `apps/frontend/src/pages/index.astro` has no DOM container for it and no import. This spec closes that gap: add a `<section id="agent-view-root" data-agent-view-root>` container in the dashboard layout of `index.astro`, import `mountAgentView` in the page's client script, and call it on the container in the `init()` function. The gate is a real Playwright browser test that opens the dashboard and asserts the three `[data-group-heading]` elements ("Needs input", "Working", "Completed") are visible at runtime.

## Constraints

- No changes to `agent-view.ts` logic beyond any minimal empty-state fix needed for the Playwright test to pass without a running backend (the `render()` function already renders all three group sections unconditionally, so this should not be needed)
- No new frontend framework or library
- Playwright test must pass without backend running (`reuseExistingServer: true` on frontend only)
- No `any` types; no `as` casts outside test files
- Out of scope: PR-status dot, remote-auth, write-to-pane, ptySock IPC

## Acceptance criteria

- [ ] `apps/frontend/src/pages/index.astro` contains an element with `id="agent-view-root"`
- [ ] `apps/frontend/src/pages/index.astro` client script imports `mountAgentView` from `../dashboard/agent-view`
- [ ] `apps/frontend/src/pages/index.astro` client script calls `mountAgentView(` on the container
- [ ] A Playwright browser test opens `http://127.0.0.1:5274`, finds `[data-group-heading]` elements for "Needs input", "Working", "Completed", and asserts they are visible
- [ ] The Playwright test passes without a running backend (frontend-only webServer mode)

## Context

- Spec 056 archived at `specs/archive/2026-05-13-056-agent-view-mirror/`
- `mountAgentView` exported at `apps/frontend/src/dashboard/agent-view.ts:243`
- `render()` always renders all three group sections via `GROUP_ORDER` loop, even when `agentRows` is empty — so headings appear without a backend
- CSS class `.agent-view` exists at `apps/frontend/src/styles/dashboard.css:1318`
- 056's e2e gate (`apps/e2e/tests/agent-view.spec.ts`) was a static source-grep script, not a real browser test — this spec replaces that pattern for the mount check
