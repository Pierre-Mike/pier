---
id: 013-migrate-sessions-to-route-kit
title: Pilot-migrate sessions.routes.ts to route-kit
status: archived
kind: code
gate:
  - path: apps/backend/src/features/sessions/sessions.routes.test.ts
    level: unit
  - path: apps/backend/src/features/sessions/sessions.routes.integration.test.ts
    level: integration
created: 2026-04-30
archived: 2026-05-01
owner: main
depends_on: []
supersedes: null
---

## Intent

Replace the `defineRoute`-based wiring in `sessions.routes.ts` with the new `route()` + `mountPair()` API to validate the route-kit on the dominant `Pattern A` shape (single feature service Layer over `ConfigService`, 5 routes), so the rest of the migration + the `defineRoute` removal can proceed with one-feature evidence rather than zero.

## Constraints

- ONLY two files touched by implementation: `apps/backend/src/features/sessions/sessions.routes.ts` and the new `apps/backend/src/features/sessions/sessions.routes.integration.test.ts`
- Existing `sessions.routes.test.ts` is the unit gate — it must pass UNCHANGED post-migration
- DO NOT delete or move `defineRoute`
- DO NOT migrate any other feature
- DO NOT touch `api.ts`
- DO NOT add Biome/`dependency-cruiser` rules
- DO NOT update `AGENTS.md`
- Handler bodies stay 100% identical

## Acceptance criteria

- [ ] `sessions.routes.ts` uses `route()` + `mountPair()` instead of `defineRoute` and parallel Hono chains
- [ ] Existing `sessions.routes.test.ts` passes unchanged (imports `sessionsRoute.testApp`)
- [ ] New `sessions.routes.integration.test.ts` validates that `mountPair` built both `app` and `testApp` halves
- [ ] `bunx turbo check:local` passes (typecheck + test + lint:ci + colocated-tests + secret-scan + build)
- [ ] `bun run tasks:verify` shows ≥1 unit + ≥1 integration gate green

## Context

- Builds on PR #31 (spec 012-route-kit): https://github.com/Pierre-Mike/pier/pull/31
- Active dir: `specs/active/012-route-kit/` (not archived because pre-existing 011 spec blocks `spec:complete`)
- This is the pilot validation of route-kit on Pattern A before bulk migration
