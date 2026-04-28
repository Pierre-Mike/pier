# Design

## Approach

Add a small regression test that asserts the Astro dashboard page imports and calls `wireSettingsModal`, then update `index.astro` to do exactly that.

## Files touched

- `apps/frontend/src/pages/index.astro`
- `apps/frontend/src/dashboard/settings.test.ts`

## Decisions

- Use a static test against the Astro source because this is a boot-wiring regression, not modal behavior.
- Leave modal implementation unchanged.

## Out of scope

- Changing settings UI/UX.
- Changing backend settings routes.
