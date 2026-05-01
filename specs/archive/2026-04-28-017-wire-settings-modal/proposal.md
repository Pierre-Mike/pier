---
id: 017-wire-settings-modal
title: Wire settings modal into dashboard init
status: archived
kind: code
gate:
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

Make the settings popup introduced by spec 002 visible in the dashboard by wiring its initializer into the page boot sequence.

## Constraints

- Keep change minimal and frontend-only.
- Do not alter settings modal behavior or backend routes.
- Do not touch archived specs.

## Acceptance criteria

- [ ] Dashboard page imports `wireSettingsModal` from `../dashboard/settings`.
- [ ] Dashboard `wireUI()` calls `wireSettingsModal()` during init.
- [ ] Existing relevant frontend checks pass.

## Context

PR #4 added `apps/frontend/src/dashboard/settings.ts`, but `apps/frontend/src/pages/index.astro` never imports or calls `wireSettingsModal`, so the FAB/modal HTML is never injected.
