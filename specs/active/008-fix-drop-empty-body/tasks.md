# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch. Every
  file a task actually modifies must match at least one glob here, or
  `tasks-verify.ts` will fail the spec.

- [ ] 1. Fix handleOSFileDrop to pass plain object to hc
  - agent: main
  - depends: []
  - file_targets: [apps/frontend/src/dashboard/drop.ts]
  - boundary: [apps/frontend/src/dashboard/drop.ts]
- [ ] 2. Verify gate passes
  - agent: main
  - depends: [1]
  - file_targets: [apps/frontend/src/dashboard/drop.test.ts, scripts/smoke-drop-form.ts]
  - boundary: [apps/frontend/src/dashboard/drop.test.ts, scripts/smoke-drop-form.ts]
