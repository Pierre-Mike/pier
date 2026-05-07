# Tasks

- [x] 1. Author the gate (RED): hermetic smoke that reproduces the lefthook hooksPath conflict
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-prepare-lefthook-with-hookspath.ts]
  - boundary: [scripts/smoke-prepare-lefthook-with-hookspath.ts]
- [x] 2. Apply fix: append `--force` to root `prepare` script
  - agent: main
  - depends: [1]
  - file_targets: [package.json]
  - boundary: [package.json]
