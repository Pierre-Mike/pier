# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- [ ] 1. Add carve-out filter to `findCastViolations`
  - agent: main
  - depends: []
  - file_targets: [packages/api-contract/src/invariants.ts]
  - boundary: [packages/api-contract/src/invariants.ts]
- [ ] 2. Add gate test case for the carve-out
  - agent: main
  - depends: [1]
  - file_targets: [packages/api-contract/src/invariants.test.ts]
  - boundary: [packages/api-contract/src/invariants.test.ts]
- [ ] 3. Add e2e smoke script gate
  - agent: main
  - depends: [1]
  - file_targets: [scripts/smoke-invariants-009.ts]
  - boundary: [scripts/smoke-invariants-009.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
