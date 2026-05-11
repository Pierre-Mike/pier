---
id: '043'
title: Require apps/e2e gate entry on frontend-touching code specs
status: archived
kind: rule
gate: scripts/gates/frontend-e2e-gate-required.ts
created: 2026-05-11T00:00:00.000Z
owner: main
depends_on:
  - 036-e2e-smoke
supersedes: null
archived: '2026-05-11'
---

## Intent

Any `kind:code` spec whose task `file_targets` include files under
`apps/frontend/src/pages/**` or `apps/frontend/src/dashboard/**` must declare at
least one `apps/e2e/tests/*.spec.ts` gate entry. This prevents the 040→041→042
regression pattern where specs passed unit + integration gates but broke
page-composition wiring that only a real DOM exercised via Playwright would catch.

The rule is enforced by a new `validateFrontendE2eGate` check added to
`scripts/spec-lint.ts`. The rule itself is a `kind:rule` gate artifact at
`scripts/gates/frontend-e2e-gate-required.ts` that verifies the check against
two fixture spec directories (one pass case, one fail case).

## Constraints

- Narrow glob: `apps/frontend/src/pages/**` and `apps/frontend/src/dashboard/**` only (not all of `apps/frontend/src/**`).
- Source: per-task `file_targets` (intent), NOT `boundary` (wider, false-positive surface).
- Exclude files ending in `.test.ts` or `.spec.ts` before matching the frontend globs.
- Hard fail (no warning level) — consistent with existing spec-lint behaviour.
- No changes to historical specs (out of scope).
- The function must be exported so the gate artifact can import it.

## Acceptance criteria

- [ ] `validateFrontendE2eGate` exported from `scripts/spec-lint.ts`
- [ ] Returns `{ errors: [] }` for kind≠code specs
- [ ] Returns `{ errors: [] }` when no frontend file_targets are present (after test-file exclusion)
- [ ] Returns `{ errors: [] }` when an `apps/e2e/tests/*.spec.ts` gate entry is present
- [ ] Returns an error matching the expected message string when frontend file_targets exist but no e2e gate entry is declared
- [ ] `scripts/gates/frontend-e2e-gate-required.ts` exits 0 when: fail-fixture → errors non-empty, pass-fixture → errors empty
- [ ] `scripts/gates/frontend-e2e-gate-required.ts` exits 1 if either fixture produces the wrong result
- [ ] Fixture directories exist at `scripts/gates/fixtures/frontend-e2e-gate-required/{pass,fail}/`

## Context

Retro window: 2026-05-04 → 2026-05-11.
Motivated by specs 040-lazy-load-file-tree, 041-palette-file-search, 042-wire-palette-sidebar.
See `findings.md` in this spec folder for the full retro.
depends_on 036-e2e-smoke because the Playwright infra must exist before we mandate e2e gate entries.
