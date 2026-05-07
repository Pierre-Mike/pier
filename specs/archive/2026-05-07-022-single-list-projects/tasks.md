# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- [x] 1. Restore `!store.sessions.has(p.id)` filter clause in `filteredProjects()`
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]

- [x] 2. Remove dead `li.classList.add("open")` line in `renderProjects()`
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]
