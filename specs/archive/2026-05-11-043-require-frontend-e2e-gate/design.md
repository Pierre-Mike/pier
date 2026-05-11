# Design

## Approach

Add a pure validator function `validateFrontendE2eGate` to `scripts/spec-lint.ts`. Wire it into the existing per-spec loop in `main()`. Export it so the gate artifact can import and call it directly against synthesised `Spec`-shaped objects.

The gate artifact (`scripts/gates/frontend-e2e-gate-required.ts`) is a standalone Bun script that:
1. Loads two fixture spec directories (pass + fail).
2. Calls `validateFrontendE2eGate` on each.
3. Asserts the fail-fixture produces the expected error and the pass-fixture produces no errors.
4. Exits 0 on correct behaviour, throws (exit 1) on mismatch.

Fixtures are minimal spec dirs containing only `proposal.md` and `tasks.md` — enough for `validateFrontendE2eGate` to inspect `kind`, `gate`, and `file_targets`.

## Files touched

- `scripts/spec-lint.ts` — add + export `validateFrontendE2eGate`, wire into `main()`
- `scripts/gates/frontend-e2e-gate-required.ts` — new gate artifact (the rule)
- `scripts/gates/fixtures/frontend-e2e-gate-required/pass/proposal.md` — pass fixture
- `scripts/gates/fixtures/frontend-e2e-gate-required/pass/tasks.md` — pass fixture tasks
- `scripts/gates/fixtures/frontend-e2e-gate-required/fail/proposal.md` — fail fixture
- `scripts/gates/fixtures/frontend-e2e-gate-required/fail/tasks.md` — fail fixture tasks
- `specs/active/043-require-frontend-e2e-gate/findings.md` — retro audit trail

## Decisions

- **Narrow globs** — `apps/frontend/src/pages/**` and `apps/frontend/src/dashboard/**` only. Motivated by where the 040–042 regressions lived. Widening is a 1-line change if needed later.
- **file_targets as the signal** — `boundary` has wider surface and would generate false positives. `file_targets` is the declared author intent.
- **Exclude test files before glob matching** — files ending in `.test.ts` or `.spec.ts` are excluded before the frontend glob check. A spec touching only test files in the frontend tree is not a user-visible behaviour change.
- **Hard fail** — spec-lint has no warning level. An advisory warning equals the status quo.
- **Fixture IDs use `999-` prefix** — avoids any collision with real spec numbering.
- **Gate reads tasks.md via `parseTasksFile`** — already exported from `scripts/spec-lint.ts`; no new parser needed.

## Risks

- `gateEntries` in `_lib.ts` expects the `gate:` frontmatter to be valid typed entries or scalar/string[]. Fixture frontmatter must use the correct shape.

## Out of scope

- Retroactively applying the rule to existing archived specs.
- Widening `FRONTEND_GLOBS` beyond `pages/` and `dashboard/`.
- Adding a warning tier to spec-lint.
