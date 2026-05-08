# Design

## Approach

Extend `renderSessions()` in `apps/frontend/src/dashboard/projects.ts` to conditionally render a `<span class="session-alive-dot">` element inside each session `<li>`. The dot appears only when the session entry has a non-empty `sessionId`, which indicates the backend has confirmed a live zellij session. The dot is placed adjacent to the existing `<span class="close">` button so it visually annotates the "close will not kill" affordance.

`renderSessions` currently builds the `<li>` innerHTML as a single template string. The update inserts the conditional dot span — either by switching to DOM element construction for the new span, or by embedding a conditional template expression. The DOM-construction approach is preferred (mirrors the existing `file_targets` pattern in `files.ts`) but either passes the gate.

CSS for `.session-alive-dot` follows the existing `.dot` pattern in the dashboard stylesheet (green, small circle) — a new modifier class keeps the styling orthogonal to the project-color dot.

## Files touched

- `apps/frontend/src/dashboard/projects.ts` — modify `renderSessions` to conditionally append a `session-alive-dot` span when `sess.sessionId` is truthy.
- `apps/frontend/src/styles/dashboard.css` (or equivalent) — add `.session-alive-dot` CSS rule (green dot, positioned near the close button). Per the Astro-scoped-style memory note, CSS goes into the external stylesheet, not a `<style>` block.

## Decisions

- **Class name `session-alive-dot`** — distinct from the existing `dot` class (which is the project-color indicator) to avoid style collision and to be unambiguously queryable in tests.
- **Conditional on `sessionId`** — `Session.sessionId` is the confirmation that the backend registered a zellij session. A session entry with `url` but no `sessionId` is a pre-confirmed placeholder; showing a dot there would be misleading.
- **Placement adjacent to close button** — consistent with the "closing leaves the session alive" narrative introduced by spec 034.
- **No new dependency** — reuse existing DOM construction patterns.

## Risks

- `extractFunctionBody` regex in the unit test may not capture the new `sess` destructuring if the loop variable changes. The implementer should keep the `[pid, sess]` destructuring pattern (currently unused but present in renderSessions — note: currently the loop uses only `[pid]`). The implementer will need to change the destructure to `[pid, sess]` to access `sess.sessionId`.

## Out of scope

- Animating the dot or adding tooltip text (future polish).
- Showing the dot in the projects list (explicitly excluded by AC 3).
- Changing the dismiss or kill behavior (owned by spec 034).
