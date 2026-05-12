# Design

## Approach

Extract existing dark colour tokens from `dashboard.css` `:root` into a new `theme.css` file under the same `src/styles/` directory. Define matching light-mode tokens in the same file under `[data-theme="light"]`. Keep `dashboard.css` importing `theme.css` so no component imports change. A thin `theme.ts` module handles toggle logic and `localStorage` persistence. An inline `<script>` in `index.astro`'s `<head>` sets `data-theme` before first paint to eliminate FOUC.

## Files touched

- `apps/frontend/src/styles/theme.css` — new file; defines `[data-theme="dark"]` and `[data-theme="light"]` token blocks
- `apps/frontend/src/styles/dashboard.css` — remove inline `:root` colour tokens (they move to `theme.css`); add `@import "./theme.css"` at top
- `apps/frontend/src/dashboard/theme.ts` — new file; exports `initTheme()` (wires toggle button click → `data-theme` flip + `localStorage` write) and `getTheme()` (reads `localStorage`, defaults to `"dark"`)
- `apps/frontend/src/pages/index.astro` — add inline `<script>` in `<head>` for pre-paint init; add `<button data-testid="theme-toggle">` in sidebar pane head

## Decisions

- **`[data-theme]` attribute over CSS class** — attribute selectors are cleaner for single-axis theming; avoids class-name collisions with component classes.
- **`data-theme` on `<html>`** — widest cascade scope; all `var(--token)` references resolve regardless of nesting.
- **Default theme: dark** — matches current colour scheme; dark is the product default.
- **No new dependencies** — CSS custom properties + a small TS module cover the full requirement.
- **Inline init script** — `localStorage.getItem("pier-theme")` evaluated synchronously before `<body>` renders; prevents light-flash on dark-preferring users who have never set a preference.
- **theme.css imported by dashboard.css** — avoids touching every component or layout that already imports dashboard.css.

## Risks

- If `dashboard.css` `:root` block is removed but some selector still relies on unqualified `:root`, it will break. Mitigation: keep a `:root` fallback in `theme.css` that mirrors the dark tokens as the default (in addition to `[data-theme="dark"]`).

## Out of scope

- System-preference (`prefers-color-scheme`) auto-detection beyond the inline init fallback.
- Per-component theme overrides.
- Backend or API changes.
- Animation/transition on theme switch.
