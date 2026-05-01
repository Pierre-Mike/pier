# Design

## Approach

Mechanical migration of 10 `*.routes.ts` files to route-kit, then deletion of the `defineRoute` 3-overload set + its tests. `effect-handler.ts` shrinks to ~25 LOC (imports, `AppBindings` re-export, `AnyContext`, `runHandler`).

Pattern distribution after audit:

| Pattern in the file                   | route-kit API call            | Files |
|---|---|---|
| No deps (handler R = never)           | `route({ deps: "none", … })`  | `health` |
| Static config-only auto-bundle        | `route({ handler })`          | `config` |
| Single feature Layer + ConfigService  | `route({ deps:{live,test} })` | (already done — `sessions`) |
| Everything else                       | `routeAdvanced({…})`          | `version`, `artifacts`, `artifacts.blob`, `projects`, `projects.blob`, `projects.drop`, `events.history`, `settings` (8) |

8 of 10 files use `routeAdvanced` — not a route-kit failure, but the actual shape distribution: most features have dynamic `c.env`-derived Layers, multi-Layer composition with sharing, or per-route deps.

## Files touched

**Group 1 — Feature routes (10 files):**
- `apps/backend/src/features/health/health.routes.ts` — `route({ deps: "none", handler })`
- `apps/backend/src/features/config/config.routes.ts` — `route({ handler })` (auto-bundles config)
- `apps/backend/src/features/version/version.routes.ts` — `routeAdvanced` with `(c) => makeConfigLayer(c.env)` for live
- `apps/backend/src/features/artifacts/artifacts.routes.ts` — `routeAdvanced` with inline Layer.merge
- `apps/backend/src/features/artifacts/artifacts.blob.routes.ts` — `routeAdvanced` with cfg + blob
- `apps/backend/src/features/projects/projects.routes.ts` — `routeAdvanced` + `mountPair` (2 routes, per-route deps)
- `apps/backend/src/features/projects/projects.blob.routes.ts` — `routeAdvanced` with repo over cfg + blob
- `apps/backend/src/features/projects/projects.drop.routes.ts` — `routeAdvanced` with Layer.mergeAll
- `apps/backend/src/features/events/events.history.routes.ts` — `routeAdvanced` + `mountPair` (2 routes, shared bus/stream)
- `apps/backend/src/features/settings/settings.routes.ts` — `route()` for ServicePair, skip mountPair (divergent middleware)

**Group 2 — Shrink effect-handler.ts:**
- `apps/backend/src/platform/effect-handler.ts` — delete 3 `defineRoute` overloads, drop `Layer` import

**Group 3 — Delete old tests:**
- `apps/backend/src/platform/effect-handler.test.ts` — DELETE (tests deleted `defineRoute` surface)
- `apps/backend/src/platform/effect-handler.test-d.ts` — DELETE (type-tests deleted overloads)

**Group 4 — Gate:**
- `apps/backend/src/platform/effect-handler.shrink.test.ts` — NEW (~10 lines, asserts `defineRoute` absent, `runHandler` present)

## Decisions

**Decision 1 — settings.routes.ts: divergent middleware between app and testApp**

`settings.routes.ts` has DIFFERENT middleware between `app` and `testApp`: `app` has `localhostGuard` only; `testApp` adds a host-injection middleware before `localhostGuard` so bun's default Request (no `host` header) passes the loopback check. `mountPair`'s single builder doesn't fit (it's for uniform chains).

**Skip mountPair. Build chains by hand. Two route-kit calls.**

```ts
const r = route({
  deps: { live: ZellijAuthLive, test: ZellijAuthTest },
  handler: zellijReadonlyHandler,
});

const app = new Hono<{ Bindings: AppBindings }>()
  .use("/settings/*", localhostGuard)
  .get("/settings/zellij-readonly", r.live);

export const buildSettingsTestApp = (layer: Layer.Layer<ZellijAuthService>) => {
  const ra = routeAdvanced({ liveDeps: layer, testDeps: layer, handler: zellijReadonlyHandler });
  return new Hono<{ Bindings: AppBindings }>()
    .use("/settings/*", hostInjector)
    .use("/settings/*", localhostGuard)
    .get("/settings/zellij-readonly", ra.live);
};

const testApp = buildSettingsTestApp(ZellijAuthTest);
```

`buildSettingsTestApp` keeps its public shape (used by tests to inject custom Layers). `routeAdvanced` is the right primitive there since the caller-supplied Layer IS the auth source — no auto-bundling needed.

**Decision 2 — version.routes.ts: per-request c.env config**

`version.routes.ts` is the ONLY file using a per-request dynamic Layer: `deps: (c) => makeConfigLayer(c.env)` for live, `ConfigTest` for test. The `c.env` reference is critical — it pulls Cloudflare Workers bindings, which `defaultConfigLayer` (read from `process.env`) doesn't.

**Use routeAdvanced. Do NOT use route()'s config-only overload — it would silently swap c.env for process.env.**

```ts
const r = routeAdvanced({
  liveDeps: (c) => makeConfigLayer(c.env),
  testDeps: ConfigTest,
  handler: versionHandler,
});

const app = new Hono<...>().get("/version", r.live);
const testApp = new Hono<...>().get("/version", r.test);
```

**Decision 3 — After deletion, keep effect-handler.ts as-is post-shrink**

Once defineRoute is gone, effect-handler.ts is ~25 lines: `runHandler` + `AppBindings` re-export + `AnyContext`. Do NOT rename. Do NOT move runHandler into route-kit.ts. Reasons: (1) every feature still imports `AppBindings` from `effect-handler.ts` — moving/renaming churns 11+ files and is out of scope; (2) the dependency-cruiser rule `effect-handler-stays-pure-glue` already pins this path; (3) the file pays no rent post-shrink. A follow-up PR can do `effect-handler.ts → effect-runtime.ts` rename in isolation if desired.

## Out of scope

- Do NOT touch `apps/backend/src/api.ts` (export shapes preserved; api.ts unchanged).
- Do NOT update `AGENTS.md`.
- Do NOT add Biome `noRestrictedImports` or `dependency-cruiser` allowlist rules for `routeAdvanced`.
- Do NOT migrate `Effect.catchAll` inside handler bodies to `route()`'s `onError` — handler bodies stay 100% identical.
- Do NOT modify any `*.routes.test.ts` file. They must continue to pass UNCHANGED. If a test breaks, fix the implementation, not the test.
- Do NOT modify `route-kit.ts` itself — if a route-kit limitation surfaces, stop and report; do not widen the API mid-PR.
