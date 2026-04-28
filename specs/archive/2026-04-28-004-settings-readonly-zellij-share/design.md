# Design

## Approach

Tighten existing settings/zellij read-only implementation with explicit capability metadata, stronger regression tests, and clearer frontend wording.

## Files touched

- `apps/backend/src/infra/zellij-auth.ts`
- `apps/backend/src/infra/zellij-auth.test.ts`
- `apps/backend/src/shell/routes/settings.ts`
- `apps/backend/src/shell/routes/settings.test.ts`
- `apps/frontend/src/dashboard/settings.ts`
- `apps/frontend/src/dashboard/settings.test.ts`

## Decisions

- Keep one share endpoint: `/settings/zellij-readonly`.
- Add explicit response metadata (`access: "read-only"`, `mode: "watch"`) so clients can assert intent, not just token shape.
- Rename About label to local backend wording and keep it non-copyable.

## Out of scope

- Implementing zellij itself.
- Adding public/non-loopback sharing transport.
