# Design

## Approach

Introduce a `terminal-theme.ts` module that relays the UI theme to active terminal iframes. The module exports `syncTerminalTheme(theme: "dark" | "light"): void`. After implementation work, `theme.ts` will import and call this function.

The implementation must investigate and choose one relay mechanism:

1. **`postMessage`** — send `{ type: "pier-theme", theme }` to each iframe's `contentWindow`. The receiving zellij-web page must listen and apply. Cross-origin send is allowed; the question is whether zellij-web listens.

2. **URL query param on iframe.src** — append `?theme=<value>` when constructing the iframe URL. Requires modifying `projects.ts` to call `getTheme()` when building the src. For in-flight iframes, reload with the new param. Only viable if zellij-web reads a `theme` query param at load time.

3. **`color-scheme` CSS property** — set `iframe.style.colorScheme = theme`. This affects only OS-level UI (scrollbars, form controls) — NOT xterm.js terminal colors. Not viable as the sole mechanism.

4. **`data-theme` attribute on the iframe element** — applies CSS from the parent page's stylesheet. Only works if the iframe content is same-origin and styled by the parent. Not viable for cross-origin iframes.

## Investigation

The implementer must attempt the mechanisms above and document which one worked or why all fail. If no mechanism can change the terminal colors at runtime without forcing a full page reload of the zellij-web session (which would terminate and re-create the pty), this is a fundamental platform limitation.

**Expected outcome (implementer fills this in)**:
- If `postMessage` works → implement that path.
- If URL query param at load time works → implement that path (accept that existing open sessions do not change until re-opened).
- If nothing works → write `blocker.md` citing the specific constraint. The user explicitly requested no hacks.

## Implementation

_(Filled in by the implementer after investigation. Replace this section or add a ## Limitation section.)_

## Files touched

- `apps/frontend/src/dashboard/terminal-theme.ts` — new module (author from scratch)
- `apps/frontend/src/dashboard/theme.ts` — add import + call to `syncTerminalTheme`
- `apps/frontend/src/dashboard/projects.ts` — conditionally: if URL param mechanism chosen, thread the theme param into iframe.src construction

## Decisions

- **New module over inlining** — `terminal-theme.ts` is separate from `theme.ts` and `projects.ts` to keep responsibilities clear: `theme.ts` owns UI theme state; `terminal-theme.ts` owns iframe relay; `projects.ts` owns iframe lifecycle.
- **No-hack constraint** — if investigation concludes no clean mechanism exists, the implementer escalates via `blocker.md` rather than introducing a CSS hack or forceful iframe reload.

## Risks

- zellij-web may not listen to postMessage — the terminal colors stay locked to xterm.js defaults regardless of what the parent page sends. Investigation required.
- URL param reload would disrupt the user's active terminal session. If that is the only option, it may not be acceptable — implementer judgment call.

## Out of scope

- Changing the default terminal color scheme in zellij config files.
- Patching zellij-web upstream.
- Any backend changes.
