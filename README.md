# template-BPE

TypeScript monorepo template enforcing code quality through tooling, CI/CD, and AI guardrails.

## Stack

- **Monorepo:** [Turborepo](https://turbo.build/) + [Bun Workspaces](https://bun.sh/docs/install/workspaces)
- **Runtime:** [Bun](https://bun.sh) (dev/build), [Cloudflare Workers](https://workers.cloudflare.com/) (backend production)
- **Backend:** [Hono](https://hono.dev/) with end-to-end type safety via [Hono RPC](https://hono.dev/docs/guides/rpc)
- **Frontend:** [Astro](https://astro.build/) with Cloudflare Pages adapter
- **Language:** TypeScript (strict mode)
- **Error Handling & DI:** [Effect-TS](https://effect.website/) with `@effect/Schema`
- **Linter & Formatter:** [Biome](https://biomejs.dev/)
- **Git Hooks:** [Lefthook](https://github.com/evilmartians/lefthook)
- **Secret Scanning:** [Gitleaks](https://gitleaks.io/) (system binary via Homebrew)

## Architecture

Turborepo monorepo with Functional Core / Imperative Shell (Impureim Sandwich):

```
apps/
├── backend/              # Hono on Cloudflare Workers (Effect-TS)
│   ├── wrangler.toml
│   └── src/backend/
│       ├── core/         # PURE — no I/O, no side effects
│       ├── infra/        # Effect services behind Context.Tag
│       ├── shell/        # Hono routes + Effect.gen coordinators
│       │   └── api.ts    # Route definitions, exports AppType for RPC
│       └── main.ts       # Composition root — Workers fetch handler
├── frontend/             # Astro on Cloudflare Pages
│   ├── astro.config.ts
│   ├── wrangler.toml
│   └── src/
│       ├── api.ts        # hc<AppType> typed client (zero codegen)
│       ├── layouts/
│       └── pages/
packages/
└── api-contract/         # Typed Hono RPC client derived from backend's AppType
    └── src/index.ts      # createBackendClient(url) — hc<AppType>(url)
```

### Hono RPC (End-to-End Type Safety)

Types flow automatically from backend routes to the frontend — no codegen, no manual sync:

```
Backend routes (AppType)        packages/api-contract           Frontend
shell/api.ts ──────────────►  createBackendClient(url)  ◄──── src/api.ts
    typeof app                   hc<AppType>(url)              re-exports client
```

```typescript
// 1. Backend defines routes — types are inferred automatically
// apps/backend/src/backend/shell/api.ts
const app = new Hono().get("/health", (c) => c.json({ status: "ok" }));
export type AppType = typeof app;

// 2. api-contract package creates a typed client from AppType
// packages/api-contract/src/index.ts
import type { AppType } from "@template-bpe/backend/types";
import { hc } from "hono/client";
export function createBackendClient(baseUrl: string) {
  return hc<AppType>(baseUrl);
}

// 3. Frontend imports the client — fully typed, zero manual types
// apps/frontend/src/api.ts
export { createBackendClient } from "@template-bpe/api-contract";

// Usage in pages:
const api = createBackendClient("http://localhost:8787");
const res = await api.health.$get(); // fully typed
```

**Adding a new route only requires changing `shell/api.ts`** — the types propagate to the frontend automatically through `AppType`.

## Quick Start

```sh
# 1. Create repo from template
gh repo create my-app --template Pierre-Mike/template-BPE --private

# 2. Install dependencies + activate git hooks
bun install

# 3. Apply branch protection rules (requires gh CLI)
.github/setup.sh

# 4. Start development
bun run dev
```

### Prerequisites

- [Bun](https://bun.sh) (runtime & package manager)
- [Gitleaks](https://gitleaks.io/) (`brew install gitleaks`)
- [gh CLI](https://cli.github.com/) (for branch protection setup)

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Turbo dev — all apps in parallel |
| `bun run build` | Turbo build — cached, dependency-aware |
| `bun run test` | Turbo test — cached |
| `bun run typecheck` | Turbo typecheck — cached |
| `bun run lint` | Biome auto-fix (root-level) |
| `bun run lint:ci` | Biome CI — no fix |
| `bun run check` | Full pipeline via Turbo check (typecheck + lint + test + colocated-tests + secret-scan + build) |

## Pre-commit Hooks

Runs automatically on every `git commit` via Lefthook:

1. **Biome** — auto-fix + re-stage (`stage_fixed: true`)
2. **Turbo typecheck** — cached type checking across all packages
3. **Co-located tests** — ensures every `.test.ts` has a matching `.ts`
4. **Gitleaks** — secret scanning on staged files

## CI Pipeline

`type-check → biome ci → test → co-located tests → secret-scan → build` (via `turbo check`)

Each stage gates the next. No force merges.

## Branch Protection

Branch rules are defined in `.github/branch-rules.json` and enforced on `main`:

- **No direct pushes** — all changes go through PRs
- **1 approving review** + CODEOWNERS review required
- **All 6 CI checks must pass** before merge
- **Force pushes disabled**, admins not exempt

### Setup (first time)

Run once after creating a repo from this template:

```sh
.github/setup.sh
```

This reads `.github/branch-rules.json` and applies the rules via `gh api`.

### Ongoing changes

Add the `branch-protection.yml` workflow (see AGENTS.md) to auto-sync rules when `branch-rules.json` changes on `main`. This requires a `BRANCH_PROTECTION_TOKEN` secret with `repo` scope — the default `GITHUB_TOKEN` cannot modify branch protection.

| Step | Tool | When |
|------|------|------|
| Initial setup | `setup.sh` | Once, after creating repo from template |
| Ongoing changes | `branch-protection.yml` | Automatically on merge to `main` |

Both read from `branch-rules.json` — single source of truth.

## AI Agents

Ten specialized Claude agents are defined in `.claude/agents/`, mapping directly to the FCIS architecture:

| Agent | Role |
|-------|------|
| `architect-lead` | Top-level orchestrator — delegates cross-cutting features and PR reviews to team leads |
| `backend-lead` | Routes backend work to the correct architectural layer |
| `backend-core` | Pure business logic in `core/` — no I/O, no side effects |
| `backend-infra` | Effect services in `infra/` — one file per external system |
| `backend-shell` | Hono routes + Effect.gen coordinators in `shell/` |
| `frontend-lead` | Routes frontend work, enforces Hono RPC and Biome compliance |
| `frontend-worker` | Astro pages, layouts, and typed API client in `apps/frontend/src/` |
| `platform-lead` | Routes platform work to deploy or tooling agents |
| `platform-deploy` | Cloudflare deployment config, wrangler, CI/CD workflows |
| `platform-tooling` | Biome, Lefthook, Turborepo, TypeScript configs, branch protection |

### Skills

Two skills ship with the template in `.claude/skills/`:

| Skill | Purpose |
|-------|---------|
| `ts-axioms` | Engineering axioms for TypeScript projects — canonical tooling choices (Biome, Lefthook, Effect-TS, Bun) |
| `prd-to-issues` | Breaks a PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices |

## AI Guardrails

### Protected Files

The following files require **human review** and cannot be modified by AI agents:

| File | Purpose |
|------|---------|
| `AGENTS.md` | AI behavior instructions |
| `.claude/` | AI agent settings & permissions |
| `biome.json` | Linting & formatting rules |
| `lefthook.yml` | Git hook definitions |
| `turbo.json` | Build pipeline & caching |
| `tsconfig.json`, `tsconfig.base.json` | TypeScript compiler config |
| `/package.json` | Root workspace config |
| `.github/` | CI/CD workflows & CODEOWNERS |
| `**/wrangler.toml` | Cloudflare deployment config |

**Enforcement layers:**

1. **`.claude/settings.json`** — deny rules block AI from editing protected files
2. **`.github/CODEOWNERS`** — requires `@Pierre-Mike` approval on PRs touching protected files
3. **Branch protection** — PRs required, CI must pass, no force pushes

## Conventions

- **Co-located tests:** `foo.ts` → `foo.test.ts` in the same directory
- **Named parameters:** destructured objects for 3+ params (enforced: `useMaxParams: 2`)
- **No `any`:** `noExplicitAny: error`
- **Immutability:** `useConst`, `readonly`, `as const`
- **Effect-TS:** for all error handling, DI, concurrency — no try/catch, no mock frameworks
- **No Bun APIs in backend:** deploy target is Cloudflare Workers (V8 isolates)
- **Root-level Biome:** lint/format runs at monorepo root, not per-package
