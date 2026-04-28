# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec.

- [ ] 1. Rewrite README.md hero, why, and features sections
  - agent: main
  - depends: []
  - file_targets: [README.md, specs/active/006-polish-readme/readme-rubric.md]
  - boundary: [README.md, specs/active/006-polish-readme/**]
- [ ] 2. Add quickstart, install, usage, and architecture sections
  - agent: main
  - depends: [1]
  - file_targets: [README.md, specs/active/006-polish-readme/readme-rubric.md]
  - boundary: [README.md, specs/active/006-polish-readme/**]
- [ ] 3. Add structure, config, dev, contributing, license, and acknowledgements sections
  - agent: main
  - depends: [2]
  - file_targets: [README.md, specs/active/006-polish-readme/readme-rubric.md]
  - boundary: [README.md, specs/active/006-polish-readme/**]
- [ ] 4. Tick all rubric cells and write "All Checks Complete"
  - agent: main
  - depends: [3]
  - file_targets: [specs/active/006-polish-readme/readme-rubric.md]
  - boundary: [specs/active/006-polish-readme/**]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
