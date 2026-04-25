---
name: ts-axioms
description: >
  Engineering axioms and canonical tooling choices for TypeScript/JavaScript projects.
  Use when: (1) setting up a new TypeScript project or repo, (2) choosing between
  linters, formatters, hook runners, or test runners — Biome replaces ESLint and
  Prettier, Lefthook replaces husky and lint-staged, bun replaces npm and yarn,
  (3) designing module architecture or deciding where to put business logic —
  use Functional Core / Imperative Shell, (4) handling errors or choosing between
  try/catch and a typed error library — Effect-TS is the default, (5) setting up
  pre-commit hooks or CI pipelines, (6) writing tests or deciding where test files
  go — co-located, never centralised. Activate whenever the user mentions ESLint,
  Prettier, husky, lint-staged, npm, yarn, jest, Zod, try/catch, tsyringe,
  InversifyJS, or any DI framework — each is a signal to apply the canonical
  alternative. Every principle here is enforced by a tool; if a rule has no
  enforcement it does not exist.
---

# Basic Knowledge

> Engineering axioms for humans and AI agents. Every principle must be enforced by a tool — Biome, compiler, CI check, pre-commit hook, or policy gate.

## Canonical Tooling Stack

Replace these automatically — do not ask:

| Instead of | Use |
|---|---|
| ESLint + Prettier | **Biome** (`biome check --write` on save; `biome ci` in CI) |
| husky + lint-staged | **Lefthook** (`stage_fixed: true` for auto-fix + re-stage) |
| npm / yarn | **bun** |
| Zod | **@effect/Schema** (`bun add @effect/schema` — bidirectional encode/decode, branded types) |
| try/catch | **Effect-TS** `Effect<A, E, R>` |
| tsyringe / InversifyJS | **Effect Layers** (`Context.Tag` + `Layer`) |
| Jest / Vitest mocks | **Effect test Layers** (no mock frameworks needed) |

### Lefthook — `stage_fixed: true`

Configure Biome with `--write` and `stage_fixed: true` so fixes are applied and re-staged in one commit:

```yaml
# lefthook.yml
pre-commit:
  commands:
    biome:
      glob: "*.{ts,js,json}"
      run: bunx biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true   # re-stages fixed files — no second commit needed
```

Wire `lefthook install` to the `prepare` script in `package.json` so hooks activate after `bun install`.

## Architecture: Functional Core / Imperative Shell

All business logic in pure functions; all I/O in a thin coordinating shell.

```
src/
├── core/     # PURE — no I/O, no side effects, no imports from infra/ or shell/
├── infra/    # Effect services (one per external system) with Context.Tag
├── shell/    # Effect.gen sandwich coordinators — orchestrate core + infra
└── main.ts   # Composition root — provides live Layers, runs effects
```

Every shell function follows **impure(read) → pure(compute) → impure(write)**:

```ts
const processOrder = Effect.gen(function* () {
  const db = yield* Database;                     // impure read
  const order = yield* db.getOrder("123");
  const validated = yield* validateOrder(order);  // pure compute (core/)
  yield* db.saveOrder(validated);                 // impure write
});
```

Pure `core/` functions are unit-tested with data in / data out — no mocks. Infra is tested with test `Layer`s. No mock frameworks needed.

## Named Parameters

Use destructured object arguments for functions with 3+ parameters:

```ts
// Avoid
function createUser(name: string, role: string, active: boolean) {}

// Prefer
function createUser({ name, role, active }: { name: string; role: string; active: boolean }) {}
```

Enforce via Biome `complexity/useMaxParams` with `maxParameters: 2`.

## Co-located Tests

`foo.ts` → `foo.test.ts` in the same directory. Never mirror the source tree under `__tests__/` or `tests/`.

## Full Reference

For enforcement commands, CI configs, branching strategy, error handling, security, monitoring, and docs principles — see [`references/principles.md`](references/principles.md).
