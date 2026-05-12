# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- [ ] 1. Create theme.css with dark and light token blocks
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/styles/theme.css]
  - boundary: [apps/frontend/src/styles/theme.css]

- [ ] 2. Update dashboard.css to import theme.css and remove inline :root colour tokens
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/styles/dashboard.css]
  - boundary: [apps/frontend/src/styles/dashboard.css]

- [ ] 3. Create theme.ts with initTheme and getTheme exports
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/theme.ts]
  - boundary: [apps/frontend/src/dashboard/theme.ts]

- [ ] 4. Wire theme toggle into index.astro (pre-paint inline script + toggle button)
  - agent: main
  - depends: [3]
  - file_targets: [apps/frontend/src/pages/index.astro]
  - boundary: [apps/frontend/src/pages/index.astro]
