# Design

## Approach

Add a small frontend clipboard bridge module that validates terminal copy messages, writes through the parent clipboard API, and falls back to a temporary textarea copy. Wire the dashboard terminal iframe creation path to inject a helper script after iframe load so same-origin zellij pages can post selected text to the parent when terminal selection stabilizes.

## Files touched

- `apps/frontend/src/components/TerminalPane.test.ts`
- `apps/frontend/src/dashboard/terminal-clipboard.ts`
- `apps/frontend/src/dashboard/projects.ts`
- `apps/frontend/src/dashboard/projects.test.ts`

## Decisions

- Parent document owns clipboard writes.
- Iframe helper posts a typed `pier:terminal-copy` message.
- Fallback uses parent document textarea and `execCommand("copy")`.

## Out of scope

- Browser permission UI.
- zellij server changes.
