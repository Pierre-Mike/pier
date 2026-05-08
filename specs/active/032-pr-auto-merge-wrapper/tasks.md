# Tasks

- [ ] 1. Author the gate (RED): hermetic smoke driving the wrapper through queued + not-queued stubs
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-pr-merge-auto.ts]
  - boundary: [scripts/smoke-pr-merge-auto.ts]
- [ ] 2. Implement the wrapper: `scripts/pr-merge-auto.ts`
  - agent: main
  - depends: [1]
  - file_targets: [scripts/pr-merge-auto.ts]
  - boundary: [scripts/pr-merge-auto.ts]
