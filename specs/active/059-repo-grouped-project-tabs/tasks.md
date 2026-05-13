---
id: 059-repo-grouped-project-tabs
---

## Tasks

- [ ] T1: Add tab markup to Sidebar.astro
  agent: main
  depends: []
  file_targets:
    - apps/frontend/src/components/Sidebar.astro
  boundary:
    - Add `<div class="sidebar-tabs">` with two buttons ("Projects", "Active Agents")
    - Wrap existing sessions + search + #projects in `<div id="sidebar-tab-projects">`
    - Add `<div id="sidebar-tab-agents">` after it (empty — agent-view mounts here)
    - Do not add styles here (CSS goes in dashboard.css)

- [ ] T2: Add CSS for tab switcher and group headers
  agent: main
  depends: []
  file_targets:
    - apps/frontend/src/styles/dashboard.css
  boundary:
    - `.sidebar-tabs` flex row at top of sidebar content area
    - `.sidebar-tabs button` tab button base style, `.sidebar-tabs button.active` active state
    - `.proj-group-header` group label style (muted, small, uppercase)
    - `#sidebar-tab-projects.hidden`, `#sidebar-tab-agents.hidden` display:none

- [ ] T3: Export getAgentRowCount from agent-view.ts
  agent: main
  depends: []
  file_targets:
    - apps/frontend/src/dashboard/agent-view.ts
  boundary:
    - Add `export function getAgentRowCount(): number { return agentRows.length; }`
    - No other changes to agent-view.ts

- [ ] T4: Refactor renderProjects for repo-grouped rendering
  agent: main
  depends: [T1]
  file_targets:
    - apps/frontend/src/dashboard/projects.ts
  boundary:
    - Build a Map<string, Project[]> keyed by `p.path.split("/").slice(0,-1).join("/")`
    - For each group: render a `<li class="proj-group-header">` with the dir label, then the project rows
    - Preserve all existing per-row behaviors: contextmenu, alive dot, active class, highlight, user-select:none
    - filteredProjects() is still called first — groups with zero rows after filtering are skipped

- [ ] T5: Add wireSidebarTabs and renderSidebarTabs to projects.ts
  agent: main
  depends: [T1, T3]
  file_targets:
    - apps/frontend/src/dashboard/projects.ts
  boundary:
    - `wireSidebarTabs()`: wire click handlers on the two tab buttons; default to "Projects" tab active
    - `renderSidebarTabs()`: update "Active Agents" button text with badge count from getAgentRowCount()
    - On tab click: add/remove `active` class on buttons; add/remove `hidden` class on tab panels
    - Export both functions so index.astro can call them

- [ ] T6: Update index.astro — relocate agent-view mount point and wire tabs
  agent: main
  depends: [T1, T5]
  file_targets:
    - apps/frontend/src/pages/index.astro
  boundary:
    - Remove `<section id="agent-view-root" data-agent-view-root></section>`
    - Change mount target from `document.getElementById("agent-view-root")` to `document.getElementById("sidebar-tab-agents")`
    - Import and call `wireSidebarTabs()` inside `wireUI()`
    - Import and call `renderSidebarTabs()` inside the store observer chain (alongside renderProjects/renderSessions)
    - Import `getAgentRowCount` is NOT needed in index.astro — renderSidebarTabs handles it internally via the import in projects.ts
