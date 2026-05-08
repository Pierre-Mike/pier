# Tasks

- [ ] 1. Add aliveSessions to DashboardState type and store initialisation
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/types.ts, apps/frontend/src/dashboard/state.ts]
  - boundary: [apps/frontend/src/dashboard/types.ts, apps/frontend/src/dashboard/state.ts]

- [ ] 2. Populate aliveSessions in refreshProjects and render dot in renderProjects
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]
