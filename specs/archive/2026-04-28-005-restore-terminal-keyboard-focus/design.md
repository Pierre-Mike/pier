## Approach

Remove the terminal clipboard bridge module and all wiring from dashboard project rendering. Replace the iframe load-only helper path with direct iframe attributes and a small focus helper that runs on user activation.

## Files touched

- `apps/frontend/src/dashboard/projects.ts`
- `apps/frontend/src/dashboard/projects.test.ts`
- `apps/frontend/src/dashboard/terminal-focus.test.ts`
- `apps/frontend/src/dashboard/terminal-clipboard.ts`
- `apps/frontend/src/dashboard/terminal-clipboard.test.ts`

## Decisions

- Prefer native iframe focus and browser clipboard permission policy over injected scripts.
- Do not forward global keydown events into the iframe.
- Use source-level integration tests for dashboard wiring so the regression cannot reappear silently.

## Out of scope

- Zellij backend/session behavior.
- Terminal renderer internals.
