# Tasks

- [ ] 1. Extract `runHandler` helper from `effect-handler.ts`
  - agent: main
  - depends: []
  - file_targets: [apps/backend/src/platform/effect-handler.ts]
  - boundary: [apps/backend/src/platform/effect-handler.ts]
- [ ] 2. Implement `route-kit.ts` core module
  - agent: main
  - depends: [1]
  - file_targets: [apps/backend/src/platform/route-kit.ts]
  - boundary: [apps/backend/src/platform/route-kit.ts]
