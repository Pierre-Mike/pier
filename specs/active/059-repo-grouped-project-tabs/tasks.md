---
id: 059-repo-grouped-project-tabs
---

## Tasks

- [ ] T1: Add tab markup to Sidebar.astro
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/components/Sidebar.astro]
  - boundary: [apps/frontend/src/components/Sidebar.astro]

- [ ] T2: Add CSS for tab switcher and group headers
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/styles/dashboard.css]
  - boundary: [apps/frontend/src/styles/dashboard.css]

- [ ] T3: Export getAgentRowCount from agent-view.ts
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/agent-view.ts]
  - boundary: [apps/frontend/src/dashboard/agent-view.ts]

- [ ] T4: Refactor renderProjects for repo-grouped rendering
  - agent: main
  - depends: [T1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]

- [ ] T5: Add wireSidebarTabs and renderSidebarTabs to projects.ts
  - agent: main
  - depends: [T1, T3]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]

- [ ] T6: Update index.astro — relocate agent-view mount point and wire tabs
  - agent: main
  - depends: [T1, T5]
  - file_targets: [apps/frontend/src/pages/index.astro]
  - boundary: [apps/frontend/src/pages/index.astro]
