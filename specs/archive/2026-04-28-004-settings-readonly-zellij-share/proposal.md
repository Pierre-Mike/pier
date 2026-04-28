---
id: 004-settings-readonly-zellij-share
title: Ensure settings share link is read-only zellij access
status: archived
kind: code
gate:
  - path: apps/backend/src/infra/zellij-auth.test.ts
    level: unit
  - path: apps/backend/src/shell/routes/settings.test.ts
    level: integration
  - path: apps/frontend/src/dashboard/settings.test.ts
    level: unit
created: 2026-04-28T00:00:00.000Z
owner: main
depends_on:
  - 002-settings-popup-zellij-share
supersedes: null
archived: 2026-04-28
---

## Intent

Settings must expose only a true read-only zellij watcher link for sharing so viewers can watch terminal activity but cannot interact with the zellij session.

## Constraints

- Do not expose or copy read-write zellij tokens from Settings.
- Keep the Settings share tab watch-only/read-only in label and behavior.
- Keep backend route loopback-guarded.
- Re-run CI before pushing; do not bypass git hooks.

## Acceptance criteria

- [ ] Read-only token helper mints with `zellij web --create-read-only-token` and never with `--create-token`.
- [ ] Settings route response marks the capability as read-only/watch-only and returns the readonly-token URL fragment.
- [ ] Settings Share tab calls only `/settings/zellij-readonly` and labels the URL as read-only/watch-only.
- [ ] About tab wording does not imply the local zellij base URL is shareable read-write access.
