# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch.

Parallel-safe siblings are marked `[P]`.

- [ ] 1. RED gate files (palette.test.ts + smoke-010)
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/palette.test.ts, scripts/smoke-010-palette-dispatch.ts]
  - boundary: [apps/frontend/src/dashboard/palette.test.ts, scripts/smoke-010-palette-dispatch.ts]

- [ ] 2. Implement palette.ts: installPalette + internal state machine, fuzzy filter, entry builder
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/palette.ts]
  - boundary: [apps/frontend/src/dashboard/palette.ts]

- [ ] 3a. [P] PaletteModal.astro markup + styles
  - agent: main
  - depends: [2]
  - file_targets: [apps/frontend/src/components/PaletteModal.astro]
  - boundary: [apps/frontend/src/components/PaletteModal.astro]

- [ ] 3b. [P] Backend Zellij route postMessage relay injection
  - agent: main
  - depends: [2]
  - file_targets: [apps/backend/src/shell/zellij-wrapper.ts]
  - boundary: [apps/backend/src/**/*.ts]

- [ ] 4. Wire palette into index.astro bootstrap
  - agent: main
  - depends: [3a]
  - file_targets: [apps/frontend/src/pages/index.astro]
  - boundary: [apps/frontend/src/pages/index.astro]

- [ ] 5. Integration polish (focus restore, scroll behaviour, close on outside click)
  - agent: main
  - depends: [4, 3b]
  - file_targets: [apps/frontend/src/dashboard/palette.ts, apps/frontend/src/components/PaletteModal.astro]
  - boundary: [apps/frontend/src/dashboard/palette.ts, apps/frontend/src/components/PaletteModal.astro]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
