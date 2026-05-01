---
id: 012-route-kit
title: Add platform/route-kit.ts paired live/test route API
status: archived
kind: code
gate:
  - path: apps/backend/src/platform/route-kit.test.ts
    level: unit
  - path: apps/backend/src/platform/route-kit.integration.test.ts
    level: integration
created: 2026-04-30
archived: 2026-05-01
owner: main
depends_on: []
supersedes: null
---

## Intent

Add a new platform module (`route-kit`) that lets feature routes register a handler once and emit both prod and test halves with `ConfigService` auto-provided, so the live/test drift bug class becomes structurally impossible — without touching any existing feature or removing the legacy `defineRoute`.

## Constraints

- DO NOT migrate any `features/**/*.routes.ts` file.
- DO NOT delete or move `defineRoute` (only the additive `runHandler` export + an internal call-site change inside `effect-handler.ts`).
- DO NOT add `dependency-cruiser` allowlist rules for `routeAdvanced`.
- DO NOT add Biome `noRestrictedImports` / `noRestrictedSyntax` rules.
- DO NOT update `AGENTS.md`.
- Both APIs (`defineRoute` and `route-kit`) coexist after this PR. Migration is a follow-up RFC/PR.
- No new package, no new tsconfig.
- Test runner: `bun:test` (matches existing `effect-handler.test.ts` / `.test-d.ts`).
- Type-level tests use `@ts-expect-error` pattern (mirror `route-types.test-d.ts` / `effect-handler.test-d.ts`).

## Acceptance criteria

- [ ] `route()` with `{ deps: ServicePair<R>, handler }` produces `{ live, test }` where handler receives `R | ConfigService`
- [ ] `route()` with `{ handler }` (no deps) produces `{ live, test }` where handler receives `ConfigService`
- [ ] `route()` with `{ deps: "none", handler }` produces `{ live, test }` where handler receives `never` (R = never)
- [ ] `routeAdvanced()` accepts explicit `{ liveDeps, testDeps }` as `Layer<R> | ((c) => Layer<R>)` without auto-`ConfigService`
- [ ] `mountPair()` produces twin Hono apps from a builder `(app, half: "live"|"test") => T`
- [ ] Error semantics match `defineRoute` (custom `onError` or 500 JSON fallback)
- [ ] `ServicePair<R>` type shape: `{ live: Layer<R, never, ConfigService>; test: Layer<R> }`
- [ ] `RoutePair<A>` type shape: `{ live: (c) => Promise<A>; test: (c) => Promise<A> }`
- [ ] Re-export `AppBindings` from `./bindings.ts`
- [ ] `effect-handler.ts` exports internal `runHandler` helper (additive change only)

## Context

Related issue: https://github.com/Pierre-Mike/pier/issues/30

This is the platform-only implementation from the broader route-kit RFC. Feature migrations and eventual removal of `defineRoute` are explicitly out of scope for this PR.
