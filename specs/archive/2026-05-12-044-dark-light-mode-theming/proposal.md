---
id: '044'
title: Add dark/light mode theming
status: archived
kind: code
gate:
  - path: apps/frontend/src/styles/theme.test.ts
    level: unit
  - path: apps/e2e/tests/dark-light-mode-theming.spec.ts
    level: e2e
created: 2026-05-12T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-12'
---

## Intent

Introduce a theming system that supports both dark and light colour modes for the frontend application. A `theme.css` file under `apps/frontend/src/styles/` defines all colour tokens as CSS custom properties for both modes, keyed by a `data-theme` attribute on `<html>`. A toggle button in the UI allows users to switch modes; the selection is persisted in `localStorage`. This is a pure frontend change — no backend or API contract modifications.

## Constraints

- Theme CSS must live in `apps/frontend/src/styles/theme.css`, not in Astro `<style>` blocks (Astro scoped styles miss the scope hash on runtime-built DOM nodes).
- Both `data-theme="dark"` and `data-theme="light"` selectors must define the same complete set of CSS custom property tokens.
- No new npm/bun dependencies.
- Backend contracts, API shapes, and performance budget are untouched.
- The existing `dashboard.css` `:root` block becomes the dark-mode defaults; light-mode tokens must be defined separately under `[data-theme="light"]`.
- Preference must be persisted via `localStorage` and initialised before first paint (no flash of unstyled content).

## Acceptance criteria

- [ ] `apps/frontend/src/styles/theme.css` exists and defines CSS custom property tokens for `[data-theme="dark"]` and `[data-theme="light"]` with the same variable names in both selectors.
- [ ] The token set covers at minimum: `--bg`, `--bg-elev`, `--bg-hover`, `--fg`, `--fg-dim`, `--accent`, `--accent-dim`, `--border`, `--danger`, `--ok`.
- [ ] A theme-toggle button is rendered in the UI (visible in DOM as `[data-testid="theme-toggle"]`).
- [ ] Clicking the toggle switches `document.documentElement.dataset.theme` between `"dark"` and `"light"`.
- [ ] The selected theme is persisted to `localStorage` under the key `"pier-theme"`.
- [ ] On page load, the `data-theme` attribute is set from `localStorage` before first paint (inline script in `<head>`).
- [ ] `bun test apps/frontend/src/styles/theme.test.ts` passes (GREEN after implementation).
- [ ] `bun apps/e2e/tests/dark-light-mode-theming.spec.ts` exits 0 (GREEN after implementation).

## Context

- The Astro scoped-style limitation is documented in repo memory: runtime `document.createElement` nodes miss the scope hash — put CSS in `src/styles/dashboard.css` or a dedicated file.
- Current dark tokens live in `apps/frontend/src/styles/dashboard.css` under `:root`.
- Spec 043 mandates an `apps/e2e/` gate entry for frontend-touching code specs; this spec satisfies that requirement.
