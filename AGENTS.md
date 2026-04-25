# CLAUDE.md

## Project Overview

Turborepo monorepo using TypeScript, Effect-TS, Hono (Cloudflare Workers), Bun, Biome, and Lefthook.

## Monorepo Structure

```
apps/
├── backend/          # Hono on Cloudflare Workers (Effect-TS)
│   ├── wrangler.toml # Workers config
│   └── src/backend/
│       ├── core/     # PURE — no I/O, no side effects, no imports from infra/ or shell/
│       ├── infra/    # Effect services (one per external system) with Context.Tag
│       ├── shell/    # Hono routes + Effect.gen coordinators — orchestrate core + infra
│       │   └── api.ts  # Route definitions, exports AppType for RPC
│       └── main.ts   # Composition root — re-exports Hono app as Workers fetch handler
├── frontend/         # Frontend app — imports typed API client from backend
│   └── src/api.ts    # re-exports createBackendClient from api-contract
packages/
└── api-contract/     # Typed Hono RPC client derived from backend AppType
turbo.json            # Task pipeline + caching
tsconfig.base.json    # Shared TS config (all apps extend this)
biome.json            # Root-level Biome (Turborepo best practice)
lefthook.yml          # Git hooks
```

## Architecture: Functional Core / Imperative Shell

- **Core:** pure functions, `Effect<A, E, never>` returns (no dependencies), zero I/O
- **Infra:** Effect services behind `Context.Tag`
- **Shell:** Hono routes + `Effect.gen` coordinators: impure(read) → pure(compute) → impure(write)
- `Effect.runPromise` calls restricted to `shell/` and `main.ts`

### Core purity rules

- **No side effects in `core/`** — no `new Date()`, no `crypto.randomUUID()`, no `Math.random()`. Pass timestamps, IDs, and random values as parameters. Generate them in `shell/` or `infra/`.
- **Validate in one layer only** — validation logic lives in `core/` and is called from `infra/` or `shell/`. Never duplicate validation across layers.
- **No `as` type casts in non-test files** — use `Schema.decode`, brand constructors, or proper type narrowing instead of `as Foo` assertions.

### Infra rules

- **Shared D1 types** — import `D1Database` and `D1PreparedStatement` from `infra/d1-types.ts`. Do not redefine these interfaces in each repository file.

## Hono RPC (End-to-End Type Safety)

- Backend exports `AppType` from `shell/api.ts` via `"exports": { "./types" }` in package.json
- `packages/api-contract` imports `AppType` and creates a typed `hc<AppType>` client via `createBackendClient(url)`
- Frontend re-exports `createBackendClient` from `@template-bpe/api-contract` — fully typed params, query, body, response
- **Adding a new route only requires changing `shell/api.ts`** — types propagate automatically
- Zero codegen, zero runtime overhead — types are workspace-linked at build time
- **Deploy target:** Cloudflare Workers (V8 isolates, not Bun — no Bun-specific APIs in backend code)

## Commands

- `bun run dev` — turbo dev (all apps in parallel)
- `bun run build` — turbo build (cached, dependency-aware)
- `bun run test` — turbo test (cached)
- `bun run typecheck` — turbo typecheck (cached)
- `bun run lint` — biome check --write (root-level, not per-package)
- `bun run check` — full pipeline: typecheck → lint → test

## Code Style

- **Bun** for dev/build tooling. **Cloudflare Workers** for backend runtime — no Bun-specific APIs in backend
- **Effect-TS** for all error handling, DI, and concurrency — no try/catch, no mock frameworks
- **Biome** for linting + formatting — not ESLint/Prettier
- **Functional programming** — no classes outside framework code, composition over inheritance
- **Named parameters** (destructured objects) for functions with 3+ params
- **Immutability by default** — `readonly`, `as const`, `useConst`
- **Co-located tests** — `foo.ts` → `foo.test.ts` in the same directory
- **No `any`** — `noExplicitAny: error` in Biome
- **No empty catch blocks** — must log or rethrow
- **No console.log** — use structured logger

## Frontend conventions

- **API URL resolution** — Astro pages use `import { env } from "cloudflare:workers"` to get `PUBLIC_API_URL`, with a fallback to `http://localhost:8787` for local dev. The `PUBLIC_API_URL` var is only set in per-environment wrangler.toml blocks (`[env.staging.vars]`, `[env.production.vars]`), never in root `[vars]` — setting it at root breaks `astro dev` by routing to the production backend.

## Pre-commit Hooks (Lefthook)

Runs automatically on `git commit`:
1. Biome auto-fix + re-stage (`stage_fixed: true`)
2. TypeScript type check via `turbo typecheck` (cached)
3. Co-located test enforcement
4. Secret scanning (gitleaks)

## CI Pipeline Order

`type-check → biome ci → test → secret-scan → build`

Each stage blocks the next. No `--force` merges.

## Protected Files (Human Review Required)

> **Dev mode**: Protected file restrictions are currently relaxed. AI agents may modify all files directly.

## Route Authoring Conventions

### Route file location

Each route lives in its own file: `shell/routes/<name>.ts` — one file per route group.

### RouteModule export shape

Every route file must export a named object satisfying `RouteModule`:

```ts
export const fooRoute = { app, testApp } satisfies RouteModule<typeof app>;
```

- `app` — production Hono app wired with real layers (e.g. `makeConfigLayer(c.env)`)
- `testApp` — identical routes wired with test layers (e.g. `ServiceTest`)

The `{ app, testApp }` shape is enforced at compile time by the `RouteModule<TApp>` type.

### Handler factory: `defineRoute`

Use `defineRoute({ deps, handler })` for all routes. It accepts a single optional `deps` layer (factory or static) and an optional `onError` mapper.

### `api.ts` registry rule

`shell/api.ts` is a **thin registry** — it may only contain:
- `import` statements for route modules
- `.route()` mount calls on the root Hono app
- The `AppType` export

No handler logic, no `Effect.gen`, no service calls are allowed in `api.ts`.

### Test rule

Every route file (`shell/routes/<name>.ts`) must have a co-located `<name>.test.ts`.
Tests must import and exercise `testApp`, **not** the production `app` or `api.ts`:

```ts
// ✅ correct
const res = await fooRoute.testApp.request("/foo");

// ❌ wrong — bypasses isolated test layers
import app from "../api.ts";
```

### `effect-handler.ts` boundary rule

`shell/effect-handler.ts` is pure infrastructure glue (Effect runtime adapter).
It **must not** import from `core/` or `infra/` — enforced by dependency-cruiser in CI.

Violation: adding `import ... from '../core/...'` inside `effect-handler.ts` will fail the `lint:deps` check.
