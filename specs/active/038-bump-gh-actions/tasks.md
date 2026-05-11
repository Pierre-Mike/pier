# Tasks

- [ ] 1. Author the gate (RED): scan all workflows for stale action versions
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-bump-gh-actions.ts]
  - boundary: [scripts/smoke-bump-gh-actions.ts]
- [ ] 2. Bump versions in all four workflows
  - agent: main
  - depends: [1]
  - file_targets: [.github/workflows/ci.yml, .github/workflows/github-branch-rule.yml, .github/workflows/on-prd.yml, .github/workflows/on-rfc.yml]
  - boundary: [.github/workflows/*.yml]
