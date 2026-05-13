---
id: 059-repo-grouped-project-tabs
---

## Approach

### Tab switcher in the sidebar

Add a `<div class="sidebar-tabs">` block inside `Sidebar.astro`, above `#sessions-section`. It contains two `<button>` elements: "Projects" and "Active Agents". Wrap the existing projects content (sessions + search + `#projects`) in a `<div id="sidebar-tab-projects">`. Add a `<div id="sidebar-tab-agents">` that will hold the agent-view container.

Tab switching is wired in `projects.ts` via a new exported `wireSidebarTabs()` function. On click, the active button gets class `active`, the inactive panel gets class `hidden`.

The "Active Agents" button label is updated dynamically via a `renderSidebarTabs()` call whenever the agent roster changes: it reads `agentRows.length` exported from `agent-view.ts`. This requires `agent-view.ts` to export `getAgentRowCount(): number` (or the length of the internal array).

### Agent-view relocation

Currently `mountAgentView(agentViewRoot)` is called with `document.getElementById("agent-view-root")` where that element is outside the sidebar. After this spec, the mount target changes to `document.getElementById("sidebar-tab-agents")`. The `#agent-view-root` element in `index.astro` is removed; the mount point lives inside `Sidebar.astro`.

The SSE connection stays alive when the "Projects" tab is active — we only toggle CSS visibility (`hidden` class), not `unmountAgentView()`.

### Grouped rendering in renderProjects

`renderProjects()` is refactored to:
1. Call `filteredProjects()` to get the filtered list.
2. Build a `Map<string, Project[]>` keyed by parent dir: `p.path.split("/").slice(0, -1).join("/")`.
3. For each group (ordered by first-seen key), render a `<li class="proj-group-header">` with the dir name as text, followed by the project `<li data-id="...">` rows.
4. All existing behaviors (contextmenu, alive dot, active class, highlight) are preserved on the project rows.

### CSS

All new CSS (tab buttons, `proj-group-header`, `sidebar-tabs`) goes in `src/styles/dashboard.css`. No Astro `<style>` blocks.

## Files touched

- `apps/frontend/src/components/Sidebar.astro` — add tab markup and `#sidebar-tab-agents` container
- `apps/frontend/src/pages/index.astro` — remove `#agent-view-root` section; change mount target to `#sidebar-tab-agents`; call `wireSidebarTabs()` in `wireUI()`
- `apps/frontend/src/dashboard/projects.ts` — refactor `renderProjects()` for grouping; add `wireSidebarTabs()`, `renderSidebarTabs()`
- `apps/frontend/src/dashboard/agent-view.ts` — export `getAgentRowCount(): number`
- `apps/frontend/src/styles/dashboard.css` — tab switcher + group header styles

## Decisions

- Hide (not unmount) the agent-view on tab switch — SSE stays alive.
- Group key = `path.split("/").slice(0,-1).join("/")` — no new dependency (no `path` module needed in browser).
- Tab state is not persisted — resets to "Projects" tab on page load.
- Agent count badge updates alongside `renderProjects`/`renderSessions` in the store observers.

## Out of scope

- More than two tabs.
- Per-tab localStorage persistence.
- Nested grouping (repo → sub-folder).
- Drag-and-drop reordering of groups.
