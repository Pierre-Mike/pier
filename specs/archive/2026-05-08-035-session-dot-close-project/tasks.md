# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- [x] 1. Extend renderSessions to render a session-alive-dot span conditionally on sessionId
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/projects.ts]
  - boundary: [apps/frontend/src/dashboard/projects.ts]

- [x] 2. Add .session-alive-dot CSS rule to the dashboard stylesheet
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/styles/dashboard.css]
  - boundary: [apps/frontend/src/styles/dashboard.css]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
