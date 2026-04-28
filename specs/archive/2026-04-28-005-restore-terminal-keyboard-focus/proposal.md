---
id: 005-restore-terminal-keyboard-focus
title: Restore terminal keyboard focus
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/terminal-focus.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: integration
created: 2026-04-28T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-28'
---

## Intent

Restore reliable embedded terminal keyboard behavior by removing the broken iframe clipboard bridge introduced in spec 004 and keeping terminal input focused on the iframe itself.

## Constraints

- Do not inject helper scripts into the terminal iframe.
- Do not forward keyboard events or clipboard messages through the parent window.
- Preserve safe iframe clipboard permission policy where browsers support it.
- Make terminal iframes focusable and focus them from user activation.
- Non-goal: changing zellij terminal rendering or session lifecycle behavior.

## Acceptance criteria

- [ ] Terminal iframe creation is focusable and keeps clipboard permission policy.
- [ ] Terminal activation focuses the iframe instead of relying on parent-window keyboard interception.
- [ ] Broken terminal clipboard bridge source and imports are removed.

## Context

Spec 004 attempted to auto-copy terminal selections via injected iframe script and postMessage. That path is unreliable across browser user activation, origin, and CSP boundaries and regressed expected terminal keyboard behavior.
