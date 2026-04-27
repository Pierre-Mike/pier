# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec. Globs are evaluated by `Bun.Glob`
  against repo-relative POSIX paths.
  - Single-segment `*` (e.g. `scripts/*.ts`) does NOT cross directory
    boundaries. Use `**` (e.g. `apps/backend/src/**/*.ts`) for recursive matches.
  - `["*"]` is a rare escape hatch meaning "any file" — use sparingly and
    justify in design.md.
  - Missing `boundary:` is currently a deprecation warning, not an error.
    Add one to every new task.

Parallel-safe siblings are marked `[P]`.

- [ ] 1. First task
  - agent: main
  - depends: []
  - file_targets: [path/to/file.ts]
  - boundary: [path/to/file.ts]
- [ ] 2a. [P] Parallel task A
  - agent: main
  - depends: [1]
  - file_targets: [path/to/a.ts]
  - boundary: [path/to/a.ts, path/to/a.test.ts]
- [ ] 2b. [P] Parallel task B
  - agent: main
  - depends: [1]
  - file_targets: [path/to/b.ts]
  - boundary: [path/to/b.ts, path/to/b.test.ts]
- [ ] 3. Final task
  - agent: main
  - depends: [2a, 2b]
  - file_targets: [path/to/final.ts]
  - boundary: [apps/backend/src/**/*.ts]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
