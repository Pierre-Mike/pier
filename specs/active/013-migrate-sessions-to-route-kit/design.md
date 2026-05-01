# Design

Mechanical wiring swap inside ONE file. Imports change, deps consolidate, route mounting switches to `mountPair` builder, handler bodies unchanged.

## Approach

Replace the `defineRoute`-based wiring in `sessions.routes.ts` with `route()` + `mountPair()` API. Imports change (drop `Hono`, `defineRoute`, `defaultConfigLayer`, `ConfigTest`, `Layer`; add `route` and `mountPair` from `../../platform/route-kit.ts`). Replace `makeDeps`/`testDeps` with a single `const deps = { live: makeTerminalSessionsLive(), test: TerminalSessionsTest }`. Replace the parallel `app` + `testApp` Hono chains with one `mountPair((a, h) => a.post(...).get(...).delete(...))` builder. Handler bodies stay 100% identical. Export shape unchanged: `sessionsRoute = { app, testApp } satisfies RouteModule<typeof app>`.

## Files touched

- `apps/backend/src/features/sessions/sessions.routes.ts` — rewrite imports, deps, and mounting; handlers unchanged
- `apps/backend/src/features/sessions/sessions.routes.integration.test.ts` — NEW smoke test validating `mountPair` built both halves
- `apps/backend/src/features/sessions/sessions.routes.test.ts` — UNCHANGED (unit gate, already exists)

## Decisions

**Decision 1 — kind=code dual-gate for a structural migration**

The existing `sessions.routes.test.ts` exercises full request → Hono → Effect Layer → handler — by nature it's integration-shaped. But renaming would churn blame and tooling. So: keep its current path/filename and treat it as the `level: unit` gate. ADD a new minimal `sessions.routes.integration.test.ts` whose only job is to assert that `mountPair` actually built both halves (e.g. that `sessionsRoute.app` and `sessionsRoute.testApp` are both Hono instances with the expected route registered, OR a single `testApp.request("/api/sessions")` that returns 200 — pick whichever is most boring). It's bureaucratic ceremony; aim for ≤10 LOC. The migration's correctness is established by the existing 5 tests + typecheck.

**Decision 2 — `Effect.catchAll` in handler bodies vs `route()`'s `onError`**

Three handlers (`openSessionHandler`, `openDefaultSessionHandler`, `deleteSessionHandler`) currently use `.pipe(Effect.catchAll(...))` to map failures to responses. `route()` exposes `onError?: (e, c) => Response` for exactly this. **Keep `Effect.catchAll` inside handler bodies. Do not migrate them to `onError`.** Rationale: this is a wiring-validation pilot, not an error-handling refactor. Handler bodies stay 100% identical so any regression cleanly attributes to route-kit, not to the error-handling change. Migrating to `onError` would also require explicit `E`-channel typing on each handler and would alter `deleteSessionHandler`'s idempotent-delete semantic (currently "always 204"; under `onError` it becomes "204 on success, 204 on TerminalNotFound" — equivalent only if E is exactly `TerminalNotFound`, which couples the wiring file to the typed-error union). Out of pilot scope. The follow-up bulk-migration PR can take a single principled pass.

## Out of scope

- DO NOT delete or move `defineRoute`
- DO NOT migrate any other feature
- DO NOT touch `api.ts`
- DO NOT add Biome/`dependency-cruiser` rules
- DO NOT update `AGENTS.md`
- DO NOT migrate error handling to `onError` (Decision 2)
