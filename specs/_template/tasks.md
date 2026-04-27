# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
`boundary`, and `gate`.

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
- `gate` is the path to this task's gate file (slice-RED model). Each task
  declares exactly one `gate:` path; paths must be unique across all tasks and
  task indices must be contiguous from 1. The gate file is authored RED by the
  spec-tester for this slice, reviewed by the spec-judge, and then made green
  by the spec-implementer. `tasks:verify` only enforces a slice's gate once its
  `.gate-frozen-<N>` sentinel exists.

Parallel-safe siblings are marked `[P]`.

- [ ] 1. First task
  - agent: main
  - depends: []
  - file_targets: [path/to/file.ts]
  - boundary: [path/to/file.ts]
  - gate: path/to/gate-slice-1.test.ts
- [ ] 2a. [P] Parallel task A
  - agent: main
  - depends: [1]
  - file_targets: [path/to/a.ts]
  - boundary: [path/to/a.ts, path/to/a.test.ts]
  - gate: path/to/gate-slice-2a.test.ts
- [ ] 2b. [P] Parallel task B
  - agent: main
  - depends: [1]
  - file_targets: [path/to/b.ts]
  - boundary: [path/to/b.ts, path/to/b.test.ts]
  - gate: path/to/gate-slice-2b.test.ts
- [ ] 3. Final task
  - agent: main
  - depends: [2a, 2b]
  - file_targets: [path/to/final.ts]
  - boundary: [apps/backend/src/**/*.ts]
  - gate: path/to/gate-slice-3.test.ts

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
