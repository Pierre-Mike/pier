# Tasks

Ordered checklist. T1 → T2 → T3 → T4 (sequential: each agent audit builds on prior familiarity with the rubric; T4 verifies all three are done).

- [ ] 1. Audit and patch spec-tester.md
  - agent: main
  - depends: []
  - file_targets: [.claude/agents/spec-tester.md, specs/active/001-agent-docs-audit/docs-audit.md]
  - boundary: [.claude/agents/spec-tester.md, specs/active/001-agent-docs-audit/**]
- [ ] 2. Audit and patch spec-judge.md
  - agent: main
  - depends: [1]
  - file_targets: [.claude/agents/spec-judge.md, specs/active/001-agent-docs-audit/docs-audit.md]
  - boundary: [.claude/agents/spec-judge.md, specs/active/001-agent-docs-audit/**]
- [ ] 3. Audit and patch spec-implementer.md
  - agent: main
  - depends: [2]
  - file_targets: [.claude/agents/spec-implementer.md, specs/active/001-agent-docs-audit/docs-audit.md]
  - boundary: [.claude/agents/spec-implementer.md, specs/active/001-agent-docs-audit/**]
- [ ] 4. Verify gate green
  - agent: main
  - depends: [3]
  - file_targets: [specs/active/001-agent-docs-audit/docs-audit.md]
  - boundary: [specs/active/001-agent-docs-audit/**]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
