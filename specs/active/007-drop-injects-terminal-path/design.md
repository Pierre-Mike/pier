# Design

## Approach

Three-layer change following the FC/IS architecture:

1. **Infra: repo.ts** — rename `DROPS_DIR_NAME = ".drops"` to `DROPS_REL_DIR = ".pier/drops"` and update `ensureDropsDir` to use `join(root, ".pier", "drops")`. Update test adapter path from `/test/.drops/` to `/test/.pier/drops/`.

2. **Infra: terminal-sessions.ts** — add `writeChars({ projectId, text }): Effect<{ injected: boolean }, never, never>` to the `TerminalSessions` interface. Live impl spawns `zellij --session <id> action write-chars <text>` with 2 s timeout; non-zero exit returns `{ injected: false }`. Test adapter returns `{ injected: true }`.

3. **Shell: projects-drop.ts** — extend route to: (a) yield `TerminalSessions`, (b) build shell-quoted, space-joined, trailing-space text from saved paths, (c) call `writeChars`, (d) return `{ files, injected }`. Add `TerminalSessions` to `testDeps`. Move `shellQuote` logic from frontend into this route.

4. **Frontend: drop.ts** — branch on `injected` in the response: toast "Inserted into terminal: <paths>" on `true`, clipboard fallback + failure toast on `false`. Delete the `shellQuote` helper (server quotes now).

## Files touched

- `apps/backend/src/infra/repo.ts` — rename drops dir constant, update test adapter paths
- `apps/backend/src/infra/terminal-sessions.ts` — add `writeChars` to interface, live impl, and test adapter
- `apps/backend/src/shell/routes/projects-drop.ts` — inject `TerminalSessions`, build quoted text, return `{ files, injected }`
- `apps/frontend/src/dashboard/drop.ts` — branch on `injected`, remove `shellQuote`

## Decisions

- **Shell-quoting on server** — avoids duplicating quoting logic; frontend renders server-provided paths in toasts only.
- **Trailing space** — mirrors macOS Terminal drag-drop; user can immediately type next argument.
- **Fire-and-wait 2 s** — long enough for zellij socket round-trip; short enough to not block the upload response.
- **`injected: false` not an error** — degraded path is intentional; files are saved and clipboard fallback runs.
- **No clipboard on success** — avoids clobbering user's clipboard unexpectedly.

## Risks

- Zellij socket path length: `ZELLIJ_SOCKET_DIR=/tmp/z` is already pinned in `terminal-sessions.ts`; no new risk.
- Single-quote injection in file names: `shellQuote` must escape single quotes inside names (`'` → `'\''`).

## Out of scope

- Multi-pane selection (inject into a specific pane by index).
- Progress indication for large file uploads.
- Frontend E2E / Playwright tests.
