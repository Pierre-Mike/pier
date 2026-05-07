# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec. Globs are evaluated by `Bun.Glob`
  against repo-relative POSIX paths.

Parallel-safe siblings are marked `[P]`.

- [ ] 1. Implement `scripts/preflight-main-ci.ts`
  - agent: main
  - depends: []
  - file_targets: [scripts/preflight-main-ci.ts]
  - boundary: [scripts/preflight-main-ci.ts]
- [ ] 2. [P] Wire preflight into `scripts/worktree-open.ts` with `--force` plumb-through
  - agent: main
  - depends: [1]
  - file_targets: [scripts/worktree-open.ts]
  - boundary: [scripts/worktree-open.ts]
- [ ] 3. [P] Wire smoke into `bun run tasks:verify` if needed (confirm `package.json` wiring)
  - agent: main
  - depends: [1]
  - file_targets: [package.json]
  - boundary: [package.json]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
