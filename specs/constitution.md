# Constitution

Invariants that govern every change in this repository. Referenced by `AGENTS.md` and enforced by hooks/lints/CI wherever possible.

## 1. Spec-first

- No change to production code (under `apps/**`, `packages/**`, `.github/**`) without an active spec in `specs/active/NNN-slug/`.
- Every spec has a single `gate:` in its frontmatter declaring how "done" is verified.
- Gates are verified by `scripts/tasks-verify.ts`, never by human judgement alone.

## 2. Deterministic-first

If an axiom, rule, or transition can be checked deterministically, it MUST NOT be a skill.

| Axiom type | Enforcement |
|---|---|
| Syntactic / structural | Biome, TypeScript |
| Path / behavioral | `.claude/hooks.ts` |
| Test-expressible | colocated `*.test.ts` |
| Workflow ordering | Lefthook, GitHub Actions |
| Genuine judgement (ambiguous) | skill — last resort |

## 3. State via filesystem

- Active vs archive is a directory, not a frontmatter flag.
- `scripts/spec-status.ts` computes ready / blocked / active from filesystem alone.
- Lifecycle transitions happen via scripts (`spec-archive.ts`), never by agents moving files directly.

## 4. Spec kinds and gates

| Kind | Gate is |
|---|---|
| `code` | ≥1 `unit` test file AND ≥1 `integration\|e2e` test file (typed list in `gate:`) |
| `rule` | a lint rule + fixtures (scalar or single-entry list in `gate:`) |
| `workflow` | a smoke script (scalar or single-entry list in `gate:`) |
| `writeup` | a markdown file with required sections (scalar or single-entry list in `gate:`) |

Every spec must declare one `kind` and at least one `gate:`. No exceptions.

`kind: code` specs must use the typed list form:
```yaml
gate:
  - path: apps/backend/src/core/foo.test.ts
    level: unit
  - path: scripts/smoke-foo.ts
    level: e2e
```

Other kinds accept a scalar path (legacy) or a single-entry list. The scalar form is lifted to `[{path, level: "unit"}]` internally.

## 5. TypeScript axioms

- `strict: true`, `noUncheckedIndexedAccess: true`
- **No `any`** — `noExplicitAny: error` in Biome
- **No `as` casts** outside test files — use `Schema.decode`, brand constructors, or proper type narrowing instead of `as Foo` assertions
- **Named parameters** for functions with 3+ arguments
- **Immutability by default** — `readonly`, `as const`

## 6. Architecture: Functional Core / Imperative Shell

- **Core** (`apps/backend/src/core/`) — pure functions. No I/O, no `new Date()`, no `crypto.randomUUID()`, no `Math.random()`, no `console.log`. Pass timestamps, IDs, and random values as parameters.
- **Infra** (`apps/backend/src/infra/`) — Effect services behind `Context.Tag`. One file per external system. Live + Test layers for every service.
- **Shell** (`apps/backend/src/shell/`) — Hono routes + `Effect.gen` coordinators. Composition root in `main.ts`. `Effect.runPromise` calls restricted to `shell/` and `main.ts`.
- **Validate in one layer only** — validation logic lives in `core/` and is called from `infra/` or `shell/`. Never duplicate validation across layers.

## 7. Forbidden imports

- `core/` may NOT import from `infra/` or `shell/`.
- `infra/` may NOT import from `shell/`.
- `apps/frontend/` may import the typed API client from `packages/api-contract` only — never directly from `apps/backend/src`.

## 8. Auto-derived files

- `packages/api-contract/` is auto-derived from the backend's `AppType`. Never edit it manually — change backend routes instead. Hook-enforced.

## 9. Deploy axioms

- Deploy to production only from `main` after all gates pass.
- `apps/backend/wrangler.toml` is a protected file — edits require an active spec targeting it.

## 10. Test axioms

- Colocated tests preferred: `foo.ts` → `foo.test.ts` in the same directory.
- A spec's gate test file lives at its permanent code location — no duplicate test trees under `specs/`.

## 11. Observability axioms

- Every tool call flows through `.claude/hooks.ts`.
- Hooks emit structured events to `.claude/traces/<session_id>.jsonl` (gitignored).
- Traces are the source of truth for what happened; logs are not.

## 12. Escalation

Any agent hitting an ambiguous axiom, a violated invariant, or a non-deterministic path MUST stop and escalate (write a `blocker.md` next to the active spec). Never guess past an invariant.
