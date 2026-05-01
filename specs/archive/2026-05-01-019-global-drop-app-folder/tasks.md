# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`, and `boundary`.

- [x] 1. Add `appRoot` to `PiguyConfig` and resolve it via marker-walk with `PIGUY_APP_ROOT` override
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/platform/config.repo.ts]
  - boundary: [apps/backend/src/platform/config.repo.ts]

- [x] 2. Extract drop helpers into `drops.helpers.ts`
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/features/drops/drops.helpers.ts]
  - boundary: [apps/backend/src/features/drops/drops.helpers.ts]

- [x] 3. Implement `DropsService` in `drops.repo.ts` with `saveDropped` and `listDropped`
  - agent: main
  - depends: [2]
  - file_targets: [apps/backend/src/features/drops/drops.repo.ts, apps/backend/src/features/drops/drops.repo.test.ts]
  - boundary: [apps/backend/src/features/drops/**/*.ts]

- [x] 4. Implement `drops.routes.ts` — POST /api/drops and GET /api/drops (gate file goes GREEN)
  - agent: main
  - depends: [3]
  - file_targets: [apps/backend/src/features/drops/drops.routes.ts]
  - boundary: [apps/backend/src/features/drops/**/*.ts]

- [x] 5. Register `dropsRoute` in `api.ts`; remove `projectsDropRoute`; update `.dependency-cruiser.cjs`
  - agent: main
  - depends: [4]
  - file_targets: [apps/backend/src/api.ts, apps/backend/.dependency-cruiser.cjs]
  - boundary: [apps/backend/src/api.ts, apps/backend/.dependency-cruiser.cjs]

- [x] 6. Delete per-project drop route and remove `saveDropped` from `projects.files.repo.ts`
  - agent: main
  - depends: [5]
  - file_targets: [apps/backend/src/features/projects/projects.files.repo.ts]
  - boundary: [apps/backend/src/features/projects/**/*.ts]

- [x] 7a. [P] Rework frontend `drop.ts` to POST to `/api/drops` with `activeProjectId`
  - agent: main
  - depends: [5]
  - file_targets: [apps/frontend/src/dashboard/drop.ts, apps/frontend/src/dashboard/drop.test.ts]
  - boundary: [apps/frontend/src/dashboard/drop.ts, apps/frontend/src/dashboard/drop.test.ts]

- [x] 7b. [P] Add "Drops" tab and panel to `settings.ts`; wire `GET /api/drops` + copy buttons
  - agent: main
  - depends: [5]
  - file_targets: [apps/frontend/src/dashboard/settings.ts, apps/frontend/src/dashboard/settings.test.ts]
  - boundary: [apps/frontend/src/dashboard/settings.ts, apps/frontend/src/dashboard/settings.test.ts]

- [x] 8. Regenerate `packages/api-contract/` from updated `AppType` (auto-derived)
  - agent: main
  - depends: [7a, 7b]
  - file_targets: [packages/api-contract/src/index.ts]
  - boundary: [packages/api-contract/**/*.ts]
