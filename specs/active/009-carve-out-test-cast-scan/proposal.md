---
id: 009-carve-out-test-cast-scan
title: Carve out test files from cast-violation scanner
status: active
kind: code
gate:
  - path: packages/api-contract/src/invariants.test.ts
    level: unit
  - path: scripts/smoke-invariants-009.ts
    level: e2e
created: 2026-04-28
owner: main
depends_on: []
supersedes: null
---

## Intent

`findCastViolations` currently flags every `.ts/.tsx` file containing `as unknown as`, including test files. The constitution explicitly permits `as` casts in test files (§5: "No `as` casts outside test files"). The scanner must skip `.test.ts` and `.test.tsx` files so that legitimate test-only casts do not block PRs.

## Constraints

- Carve-out applied inside `findCastViolations` only; `collectTsFiles` stays general-purpose.
- Skipped suffixes: `.test.ts` and `.test.tsx` — matches existing biome.json test-file patterns.
- No changes to frontend, backend, schema, or any other package.
- Existing tests in `invariants.test.ts` must stay untouched.

## Acceptance criteria

- [ ] `findCastViolations` called on a dir containing `bad.ts`, `bad.test.ts`, and `bad.test.tsx` (all with `as unknown as`) returns exactly one entry ending in `bad.ts`.
- [ ] `bad.test.ts` is NOT present in the returned list.
- [ ] `bad.test.tsx` is NOT present in the returned list.
- [ ] Existing invariant tests (dep check, frontend cast check) continue to pass.

## Context

Constitution §5: "No `as` casts outside test files". The scanner predates this carve-out; this spec closes the gap.
