# Tasks

- [ ] 1. Add validateFrontendE2eGate to spec-lint.ts and wire into main loop
  - agent: main
  - depends: []
  - file_targets: [scripts/spec-lint.ts]
  - boundary: [scripts/spec-lint.ts]

- [ ] 2. Author fixture directories (pass + fail)
  - agent: main
  - depends: [1]
  - file_targets: [scripts/gates/fixtures/frontend-e2e-gate-required/pass/proposal.md, scripts/gates/fixtures/frontend-e2e-gate-required/pass/tasks.md, scripts/gates/fixtures/frontend-e2e-gate-required/fail/proposal.md, scripts/gates/fixtures/frontend-e2e-gate-required/fail/tasks.md]
  - boundary: [scripts/gates/fixtures/**]

- [ ] 3. Author gate artifact frontend-e2e-gate-required.ts
  - agent: main
  - depends: [1, 2]
  - file_targets: [scripts/gates/frontend-e2e-gate-required.ts]
  - boundary: [scripts/gates/frontend-e2e-gate-required.ts]

- [ ] 4. Write findings.md
  - agent: main
  - depends: []
  - file_targets: [specs/active/043-require-frontend-e2e-gate/findings.md]
  - boundary: [specs/active/043-require-frontend-e2e-gate/**]
