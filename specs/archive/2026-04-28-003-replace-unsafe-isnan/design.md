# Design

## Approach

Add a narrow gate that checks the retro preflight script no longer uses the unsafe global `isNaN` call and instead uses `Number.isNaN` for the existing `commitMs` value.

## Files touched

- `scripts/gates/no-global-isnan-retro-preflight.ts`
- `scripts/retro-preflight.ts`

## Decisions

- Use a dedicated gate script so `tasks:verify` can prove the cleanup directly.
- Keep the implementation to a one-line lint-rule replacement.

## Out of scope

- Broad CSS specificity warning cleanup.
- Refactoring date parsing or retro preflight behavior.
