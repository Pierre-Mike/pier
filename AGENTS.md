# CLAUDE.md

## Project Overview

Turborepo monorepo using TypeScript, Effect-TS, Hono (Cloudflare Workers), Bun, Biome, and Lefthook.

## Workflow: spec → worktree → PR

Every change to production code (`apps/**`, `packages/**`, `.github/**`) lands as a spec. The flow:

1. `/do <intent>` — runs `align`, authors `specs/active/NNN-slug/`, dispatches the dual-agent TDD chain (spec-tester → spec-judge → spec-implementer), opens a PR with auto-merge queued.
2. `/retro [--since 7d]` — scans traces + archive, surfaces patterns, authors a follow-up `rule`/`workflow` spec via `/do`.

Main is never edited directly. All work happens in `.agentic/worktrees/<slug>/` on branch `spec/<slug>`. Constitution: `specs/constitution.md`.

Scripts:
- `bun run spec:lint` — frontmatter/dep-cycle/gate-existence validation
- `bun run tasks:verify` — runs every active spec's gate + boundary checks
- `bun run spec:complete <slug>` — verifies + ticks + archives + commits
- `bun scripts/worktree-open.ts <slug>` / `worktree-close.ts [<slug>]`

## Monorepo Structure

```
apps/
├── backend/          # Hono on Cloudflare Workers (Effect-TS)
│   ├── wrangler.toml # Workers config
│   └── src/
│       ├── features/ # One folder per feature (artifacts, events, projects, …)
│       │   └── <name>/
│       │       ├── <name>.<concern>?.core.ts      # PURE — no I/O, pure functions
│       │       ├── <name>.<concern>?.repo.ts      # Effect services behind Context.Tag
│       │       └── <name>.<concern>?.routes.ts    # Hono routes + Effect.gen orchestration
│       ├── platform/ # Feature-agnostic infrastructure shared by features/
│       │   ├── effect-handler.ts                  # defineRoute, Effect runtime adapter
│       │   ├── config.repo.ts                     # ConfigService — used by every feature
│       │   ├── sse-bus.ts                         # event/artifact pub-sub buses
│       │   ├── cloudflared.ts                     # tunnel lifecycle + dynamic-host registry
│       │   ├── security.ts, bindings.ts, sandbox-app.ts, route-types.ts
│       │   └── agents-conventions.ts
│       ├── api.ts                                 # Composition root — registers every feature route
│       └── main.ts                                # Bun.serve boot + Effect Layer composition
│
│   Tier suffixes are file-level, not folders. FCIS discipline is preserved as
│   filename suffix (.core.ts, .repo.ts, .routes.ts). Co-located tests next to
│   the subject (`<name>.routes.test.ts` next to `<name>.routes.ts`).
├── frontend/         # Frontend app — imports typed API client from backend
│   └── src/api.ts    # creates hc<AppType> client from @pier/backend/types
turbo.json            # Task pipeline + caching
tsconfig.base.json    # Shared TS config (all apps extend this)
biome.json            # Root-level Biome (Turborepo best practice)
lefthook.yml          # Git hooks
```

## Architecture: Feature Slices + Functional Core / Imperative Shell

The codebase is **vertically sliced** by feature, with FCIS discipline preserved as filename suffixes:

- **`*.core.ts`** — pure functions, `Effect<A, E, never>` returns, zero I/O
- **`*.repo.ts`** — Effect services behind `Context.Tag` (one per external system)
- **`*.routes.ts`** — Hono routes + `Effect.gen` orchestration: impure(read) → pure(compute) → impure(write)
- `Effect.runPromise` calls restricted to `*.routes.ts` and `main.ts`
- `platform/` holds anything cross-cutting (config, sse-bus, cloudflared, security, effect-handler)

### Boundary rules (enforced by dependency-cruiser)

- `core-tier-is-pure` — `*.core.ts` cannot import sibling `repo`/`routes` tiers or platform adapters
- `no-cross-feature-imports` — `features/X/*` cannot import `features/Y/*` (compose at `api.ts` or share via `platform/`)
- `platform-has-no-feature-deps` — `platform/*` cannot import `features/*` (sse-bus excepted for data-shape types)
- `effect-handler-stays-pure-glue` — `platform/effect-handler.ts` is the Effect runtime adapter, no feature imports
- `fixtures-only-from-tests` — `*.fixture.ts` is test-only

### Core purity rules

- **No side effects in `*.core.ts`** — no `new Date()`, no `crypto.randomUUID()`, no `Math.random()`. Pass timestamps, IDs, and random values as parameters. Generate them in `*.routes.ts` or `*.repo.ts`.
- **Validate in one layer only** — validation logic lives in `*.core.ts` and is called from `*.repo.ts` or `*.routes.ts`. Never duplicate validation.
- **No `as` type casts in non-test files** — use `Schema.decode`, brand constructors, or proper type narrowing instead of `as Foo` assertions.

## Hono RPC (End-to-End Type Safety)

- Backend exports `AppType` from `src/api.ts` via `"exports": { "./types" }` in package.json
- Frontend imports `AppType` from `@pier/backend/types` and creates a typed `hc<AppType>(apiBase)` client at `apps/frontend/src/api.ts`
- **Adding a new route only requires changing `src/api.ts`** — types propagate automatically
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

## Protected Files (hook-enforced)

Pre-tool-use hook (`.claude/hooks/enforce.ts`) blocks edits to:

- `apps/backend/wrangler.toml` — requires an active spec targeting it.
- `specs/archive/**` — immutable. Supersede via a new spec.
- A spec's frozen `gate:` path — once `.gate-frozen` exists, only the spec-implementer's writes elsewhere are allowed.

## Route Authoring Conventions

### Route file location

Each route lives inside its feature slice: `features/<name>/<name>.<concern>?.routes.ts` — one file per route group within a feature.

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

`src/api.ts` is a **thin registry** — it may only contain:
- `import` statements for route modules
- `.route()` mount calls on the root Hono app
- The `AppType` export

No handler logic, no `Effect.gen`, no service calls are allowed in `api.ts`.

### Test rule

Every route file (`features/<name>/<name>*.routes.ts`) must have a co-located `<name>*.routes.test.ts`.
Tests must import and exercise `testApp`, **not** the production `app` or `api.ts`:

```ts
// ✅ correct
const res = await fooRoute.testApp.request("/foo");

// ❌ wrong — bypasses isolated test layers
import app from "../api.ts";
```

### `effect-handler.ts` boundary rule

`platform/effect-handler.ts` is pure infrastructure glue (Effect runtime adapter).
It **must not** import from `features/` — enforced by dependency-cruiser in CI.

Violation: adding `import ... from '../features/...'` inside `effect-handler.ts` will fail the `lint:deps` check.
