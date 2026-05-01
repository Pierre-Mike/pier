---
id: 016-settings-popup-zellij-share
title: Add settings popup with zellij read-only share tab
status: archived
kind: code
gate:
  - path: apps/backend/src/infra/zellij-auth.test.ts
    level: unit
  - path: apps/backend/src/shell/routes/settings.test.ts
    level: integration
created: 2026-04-27T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-27'
---

## Intent

The dev dashboard must give the user a single, always-present surface for runtime configuration — surfaced via a bottom-right popup — so they can grab a shareable read-only zellij watcher URL (and other dev-time settings as they accrue) without leaving the dashboard.

## Constraints

- No `any` types; no `as` casts outside test files.
- All new backend routes inherit `localhostGuard` — loopback-only access enforced.
- FCIS: every new file has a single clear responsibility; no cross-cutting imports between unrelated modules.
- Read-only token stored at `~/.config/pier/zellij-readonly-token` (mode 0600), separate from the read-write token at `~/.config/pier/zellij-token`.
- Returned URL uses `#token=` fragment (hash) so the token never appears in server logs.
- `getZellijReadOnlyToken()` mirrors `getZellijToken()` — module-local cache, single in-flight mint.
- Non-goal: remote reachability — the shareable URL is loopback-only (or tunnelled by the user).
- Non-goal: token rotation endpoint (`POST /settings/zellij-readonly/rotate`) — future work.

## Acceptance criteria

- [ ] `getZellijReadOnlyToken()` reads from `~/.config/pier/zellij-readonly-token` when the file is present (unit test in `zellij-auth.test.ts`).
- [ ] `getZellijReadOnlyToken()` mints via `zellij web --create-read-only-token` when no file exists (unit test in `zellij-auth.test.ts`).
- [ ] `getZellijReadOnlyToken()` caches across calls so only one in-flight mint occurs (unit test in `zellij-auth.test.ts`).
- [ ] Token file is written with mode 0600 (unit test in `zellij-auth.test.ts`).
- [ ] `getZellijReadOnlyToken()` uses a separate cache and separate disk path from `getZellijToken()` (unit test in `zellij-auth.test.ts`).
- [ ] `GET /settings/zellij-readonly` returns `{ url, tokenName }` shape (unit test in `settings.test.ts`).
- [ ] Returned `url` is the zellij web origin with `#token=<readonly-token>` fragment (unit test in `settings.test.ts`).
- [ ] `url` falls back to `PIGUY_ZELLIJ_URL` env var when set (unit test in `settings.test.ts`).
- [ ] `settingsRoute` is registered in `AppType` so `client.settings["zellij-readonly"].$get()` type-checks (compile-time assertion in `settings.test.ts`).
- [ ] `localhostGuard` rejects non-loopback origin on the settings route (unit test in `settings.test.ts`).
- [ ] FAB sits at `right: 56px, bottom: 14px` — left of the logs FAB at `right: 14px` (frontend layout, verified by design review).
- [ ] Settings modal has two tabs: **Share** (active on open) and **About**.
- [ ] Share tab renders: selectable read-only URL, Copy button, Regenerate button (with confirm), token name in small print.
- [ ] About tab shows pier version and active read-write zellij URL.

## Context

- Aligned plan: see dispatch prompt for `/do 002` (2026-04-27).
- Decision 1 — URL shape: `https://127.0.0.1:8082/#token=<readonly-token>` (hash fragment, zero new proxy code).
- Decision 2 — FAB layout: independent FABs at fixed offsets, logs FAB unchanged at `right: 14px`.
- Decision 3 — Tab content: Share + About (two real tabs, no placeholders).
