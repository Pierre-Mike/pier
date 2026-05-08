# Tasks

- [x] 1. Author the gate (RED): hermetic smoke that asserts biome auto-fixes unused imports under the new override
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-biome-autofix-unused-imports.ts]
  - boundary: [scripts/smoke-biome-autofix-unused-imports.ts]
- [x] 2. Apply fix: change `noUnusedImports` to `{ level: "error", fix: "safe" }` in biome.json
  - agent: main
  - depends: [1]
  - file_targets: [biome.json]
  - boundary: [biome.json]
