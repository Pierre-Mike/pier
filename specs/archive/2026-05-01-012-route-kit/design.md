# Design

## Approach

Add `apps/backend/src/platform/route-kit.ts` and `route-kit.test.ts` + `route-kit.test-d.ts` alongside `effect-handler.ts`. Extract a shared `runHandler` helper from `effect-handler.ts` so both `defineRoute` and the new `route()` / `routeAdvanced()` use identical error semantics. No feature file is edited; no dependency-cruiser or Biome rule is flipped; AGENTS.md is not updated.

## Files touched

- `apps/backend/src/platform/route-kit.ts` (NEW) — `route()`, `routeAdvanced()`, `mountPair()`, type exports
- `apps/backend/src/platform/route-kit.test.ts` (NEW) — runtime behavior tests (bun:test)
- `apps/backend/src/platform/route-kit.test-d.ts` (NEW) — compile-time type tests (@ts-expect-error pattern)
- `apps/backend/src/platform/effect-handler.ts` — additive: export internal `runHandler` helper, rewrite `defineRoute` to call it

## Decisions

### Decision 1 — Auto-provision of `ConfigService` in `route()`

**Chosen**: `ServicePair<R>` type is `{ live: Layer<R, never, ConfigService>; test: Layer<R> }`. Runtime inside `route()` uses `Layer.provide(deps.live, defaultConfigLayer)` for live (parent → child) and `Layer.merge(deps.test, ConfigTest)` for test (merge because `deps.test` is already self-contained).

**Reasoning**: Live Layer depends on `ConfigService` from the platform. Test Layer is self-contained. Handler sees `R | ConfigService` in both halves. Features whose live Layer doesn't need `ConfigService` still pass because residual `RIn` is contravariant (`RIn=never` ≤ `RIn=ConfigService`). Features needing more than `ConfigService` won't fit `route()` and must use `routeAdvanced` (correct, by design).

**Rejected**: Requiring both halves to have `RIn = ConfigService` (too strict; some features don't need it). Auto-merging `ConfigService` into test Layer is the minimal change that makes the common case ergonomic.

### Decision 2 — Encoding "no deps / R = never"

**Chosen**: Use a literal-type sentinel `deps: "none"` for the third overload. Runtime skips Layer composition when `deps === "none"` — both halves point at the same function. Type-level: the overload forces `handler: (c) => Effect<A, E, never>`.

**Reasoning**: TypeScript's overload resolution needs a distinguishable signature. `deps: undefined` is ambiguous (collides with overload 2 which allows `deps?`). The literal `"none"` is unambiguous, self-documenting at call sites, and ergonomic (`route({ deps: "none", handler })`).

**Rejected**: Separate function `routeNoDeps()` (adds a third top-level export; overload is cleaner). `deps: null` (collides with optional `deps?`).

### Decision 3 — Share `runHandler` helper between `defineRoute` and `route-kit`

**Chosen**: Add one new internal export to `effect-handler.ts`:
```ts
/** @internal — shared by defineRoute and route-kit; not part of the public surface */
export const runHandler = <A, E>(
  effect: Effect.Effect<A, E, never>,
  c: AnyContext,
  onError?: (e: E, c: AnyContext) => Response,
): Promise<A> => { /* current Exit / Cause.failureOption / 500 fallback path */ };
```
Rewrite `defineRoute` internally to call `runHandler`. `route()` and `routeAdvanced()` both call `runHandler` for identical error semantics.

**Reasoning**: The error-handling path (Exit.isSuccess → onError → 500 fallback) is load-bearing. Duplicating it between `effect-handler.ts` and `route-kit.ts` would create drift risk. Extracting a helper is the minimal additive change.

**Rejected**: Duplicating the error logic (drift risk). Making `defineRoute` a wrapper over `route()` (inverts the layering; `defineRoute` is the legacy baseline). Marking `runHandler` as public (it's an internal detail; features should call `route()` / `routeAdvanced()` / `defineRoute`, not `runHandler` directly).

## Risks

- **Type complexity**: the three `route()` overloads and the `ServicePair<R>` conditional type may be hard to debug if a type error surfaces. Mitigation: `.test-d.ts` covers every positive and negative case; the error messages should guide users to the correct overload.
- **Self-collusion in this PR**: the same agent (me) is writing both the tests and the implementation because the `Agent` tool is unavailable. Mitigation: the tests pin observable behavior (overload selection, error semantics, `mountPair` twin-builder shape) and avoid implementation details (e.g., NOT testing that `runHandler` is called by name).

## Out of scope

- Migrating any `features/**/*.routes.ts` file (follow-up PR per RFC).
- Removing or moving `defineRoute` (stays public after this PR).
- Adding `dependency-cruiser` allowlist rules for `routeAdvanced` (deferred until migration).
- Adding Biome `noRestrictedImports` / `noRestrictedSyntax` rules (deferred until migration).
- Updating `AGENTS.md` (deferred until migration).
