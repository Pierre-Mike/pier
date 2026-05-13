# Design

## Approach

Two minimal edits to `apps/frontend/src/pages/index.astro`:
1. Add `<section id="agent-view-root" data-agent-view-root></section>` in the dashboard layout (after `<ArtifactsPane />` — the agent view panel is a dashboard-level widget that sits alongside the sidebar and artifacts pane)
2. In the `<script>` block's `wireUI()` function (or as a direct call in `init()`), import `mountAgentView` from `../dashboard/agent-view` and call it with the container element

No changes to `agent-view.ts` are expected — `render()` already unconditionally creates all three group headings.

## Files touched

- `apps/frontend/src/pages/index.astro` — add mount container + import + call
- `apps/frontend/src/pages/index.astro.mount.test.ts` — unit gate (new)
- `apps/e2e/tests/agent-view-mount.spec.ts` — e2e gate bun wrapper (new)
- `apps/e2e/tests/agent-view-mount.browser.ts` — Playwright browser test (new)

## Decisions

- **Mount point placement**: After `<ArtifactsPane />` in index.astro. The agent-view panel is dashboard-level, not a modal. It sits in the right region of the layout. The implementer chooses the exact slot based on the current layout structure.
- **Client script pattern**: Follow the existing module pattern — all dashboard modules are imported in the single `<script>` block. Add `import { mountAgentView } from "../dashboard/agent-view"` to the import list and call `mountAgentView` on the container in `init()` or `wireUI()`.
- **Gate architecture**: The e2e gate (`agent-view-mount.spec.ts`) is a bun wrapper script (matching all existing spec gates in `apps/e2e/tests/`). It checks structural source conditions first (fails RED) then spawns Playwright for the real browser assertion (GREEN). The actual Playwright test is `agent-view-mount.browser.ts` (not a spec gate path).
- **Backend-free test**: The Playwright test does not depend on the backend. `mountAgentView` calls `render()` immediately on mount which creates all three `[data-group-heading]` elements even when `agentRows` is empty. The SSE connection failure is silent (EventSource auto-reconnects).

## Out of scope

- Changes to `agent-view.ts` logic (except minimal empty-state fix if render fails without window.EventSource — not expected)
- Backend route changes
- PR-status dot, remote-auth, write-to-pane, ptySock IPC
- Styling changes (`.agent-view` CSS already exists)
