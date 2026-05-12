---
id: '045'
title: Sync iframe terminal theme with UI theme
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/terminal-theme.test.ts
    level: unit
  - path: apps/e2e/tests/terminal-theme.spec.ts
    level: e2e
created: 2026-05-12T00:00:00.000Z
owner: main
depends_on:
  - '044'
supersedes: null
archived: '2026-05-12'
---

## Intent

Spec 044 introduced a dark/light UI theme toggled by `data-theme` on `<html>` and persisted to `localStorage`. The terminal pane renders zellij-web sessions in cross-origin iframes. This spec investigates whether those iframes can follow the UI theme at runtime and, if a clean mechanism exists, implements it. If the platform (zellij-web / xterm) fundamentally prevents runtime theme changes without forcing a hack, this spec documents the limitation and stops without forcing a workaround.

## Constraints

- No new npm/bun dependencies.
- Backend contracts, API shapes, and performance budget are untouched.
- The mechanism must not force a full page reload to change theme.
- If zellij-web has no theme URL param, no postMessage API, and cross-origin CSS injection is blocked, the implementer MUST stop and document the limitation rather than produce a hack.
- Implementation must live in a new `terminal-theme.ts` module under `apps/frontend/src/dashboard/` — not inlined into `projects.ts` or `theme.ts`.
- `theme.ts` wires the new module: after applying the UI theme, it calls `syncTerminalTheme(theme)`.

## Acceptance criteria

- [ ] `apps/frontend/src/dashboard/terminal-theme.ts` exists and exports `syncTerminalTheme(theme: "dark" | "light"): void`.
- [ ] `syncTerminalTheme` iterates all active terminal iframes (those with `data-project` attribute in `#terminals`) and applies the theme — either via `postMessage`, URL query param update, or `data-theme` attribute on the iframe element itself (mechanism documented in design.md).
- [ ] `apps/frontend/src/dashboard/theme.ts` calls `syncTerminalTheme` after each theme change (both on toggle and on `initTheme()`).
- [ ] `bun test apps/frontend/src/dashboard/terminal-theme.test.ts` passes GREEN after implementation.
- [ ] `bun run apps/e2e/tests/terminal-theme.spec.ts` exits 0 GREEN after implementation.
- [ ] `design.md` documents the investigation: which mechanisms were considered, which was chosen (or why all were rejected).

## Context

- Depends on spec 044 (`specs/archive/2026-05-12-044-dark-light-mode-theming/`).
- zellij-web iframes are cross-origin: `iframe.src` points to the backend origin. Cross-origin postMessage send is always allowed; the receiving side must explicitly listen. CSS injection into cross-origin iframes is blocked by the browser's same-origin policy.
- If implementation is infeasible without a hack, the implementer writes `blocker.md` citing the specific platform constraint and exits — the orchestrator surfaces this as a limitation report.
