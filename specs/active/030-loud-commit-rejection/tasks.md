# Tasks

- [ ] 1. Author the gate (RED): hermetic smoke that asserts the COMMIT REJECTED wrapper
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-loud-commit-rejection.ts]
  - boundary: [scripts/smoke-loud-commit-rejection.ts]
- [ ] 2. Apply fix: append the `|| (echo "✖ COMMIT REJECTED..." >&2; exit 1)` wrapper to lefthook.yml's biome command
  - agent: main
  - depends: [1]
  - file_targets: [lefthook.yml]
  - boundary: [lefthook.yml]
