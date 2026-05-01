---
id: 014-migrate-and-delete-defineroute
title: Migrate remaining defineRoute callers to route-kit and delete defineRoute
status: active
kind: code
gate:
  - path: apps/backend/src/platform/effect-handler.shrink.test.ts
    level: unit
  - path: apps/backend/src/platform/route-kit.integration.test.ts
    level: integration
created: 2026-04-30
owner: main
depends_on: []
supersedes: null
---

## Intent

Collapse pier's two parallel route-wiring APIs into one by migrating the remaining 10 `defineRoute` callers to `route-kit` and deleting `defineRoute` + its overload set, so feature files have a single canonical pattern and `effect-handler.ts` shrinks to its actual responsibility (the shared `runHandler` adapter).

## Constraints

- Migrate exactly 10 `*.routes.ts` files: `health`, `config`, `version`, `artifacts`, `artifacts.blob`, `projects`, `projects.blob`, `projects.drop`, `events.history`, `settings`.
- Delete all 3 `defineRoute` overload signatures + implementation from `effect-handler.ts`.
- Delete `apps/backend/src/platform/effect-handler.test.ts` and `apps/backend/src/platform/effect-handler.test-d.ts`.
- Do NOT modify any `*.routes.test.ts` file — they must pass unchanged.
- Do NOT touch `apps/backend/src/api.ts`.
- Do NOT modify `route-kit.ts` itself.
- Do NOT add new Biome or dependency-cruiser rules.
- `effect-handler.ts` survives at ~25 LOC (imports, `AppBindings` re-export, `AnyContext`, `runHandler`). Do NOT rename the file.

## Acceptance criteria

- [ ] Unit gate: `effect-handler.shrink.test.ts` asserts `defineRoute` is not exported and `runHandler` is still exported as a function
- [ ] Integration gate: existing `route-kit.integration.test.ts` passes (proves route-kit wiring unaffected by deletion)
- [ ] All 10 feature `*.routes.ts` files use `route()` or `routeAdvanced()` from route-kit
- [ ] All pre-existing `*.routes.test.ts` files pass unchanged
- [ ] `bun run check:local` passes (typecheck + lint + test)

## Context

- Refs #31 — PR that introduced route-kit and migrated `sessions.routes.ts` (spec 012)
- Refs #32 — PR that piloted the sessions migration (spec 013)
- Completes the route-kit migration started in those PRs by removing the deprecated `defineRoute` API surface
