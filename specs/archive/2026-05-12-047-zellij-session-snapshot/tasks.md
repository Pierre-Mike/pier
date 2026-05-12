# Tasks — 047: Add Zellij session snapshot registry

- [x] 1. Add snapshot module (core types + pure functions + imperative shell)
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/features/sessions/snapshot.ts]
  - boundary: [apps/backend/src/features/sessions/snapshot.ts]

- [x] 2. Add .gitignore entries and data/snapshots/.gitkeep
  - agent: main
  - depends: [1]
  - file_targets: [.gitignore, data/snapshots/.gitkeep]
  - boundary: [.gitignore, data/snapshots/.gitkeep]

- [x] 3. Wire snapshot module into backend exports (if applicable)
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/sessions/snapshot.ts]
  - boundary: [apps/backend/src/features/sessions/**/*.ts]
