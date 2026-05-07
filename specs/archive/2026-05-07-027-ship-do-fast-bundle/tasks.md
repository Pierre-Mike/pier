# Tasks

- [x] 1. Author the gate (RED): `scripts/smoke-do-fast-bundle.ts`
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-do-fast-bundle.ts]
  - boundary: [scripts/smoke-do-fast-bundle.ts]
- [x] 2. Land the bundle: copy three files from main's untracked tree
  - agent: main
  - depends: [1]
  - file_targets: [.claude/skills/do-fast/SKILL.md, .claude/agents/do-fast-orchestrator.md, .claude/agents/spec-fielder.md]
  - boundary: [.claude/skills/do-fast/**, .claude/agents/do-fast-orchestrator.md, .claude/agents/spec-fielder.md]
