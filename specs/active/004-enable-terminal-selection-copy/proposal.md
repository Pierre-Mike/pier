---
id: 004-enable-terminal-selection-copy
title: Enable clipboard copy from embedded terminal selections
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/terminal-clipboard.test.ts
    level: unit
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: integration
created: 2026-04-28
owner: main
depends_on: []
supersedes: null
---

## Intent

Terminal text selected inside the embedded zellij iframe should reach the OS clipboard, preserving the expected terminal workflow where double-clicking or selecting text makes it immediately pasteable outside the app.

## Constraints

- Bridge clipboard copy from iframe context to the parent app instead of relying on iframe clipboard permissions.
- Validate message shape before writing to the clipboard.
- Prefer `navigator.clipboard.writeText` with a best-effort parent-document fallback.
- Avoid visible interruptions during terminal selection failures.
- Non-goal: changing zellij terminal rendering or session lifecycle behavior.

## Acceptance criteria

- [ ] Terminal clipboard bridge accepts only valid non-empty copy messages and writes text to clipboard.
- [ ] Terminal iframes are wired to receive the bridge helper so selection copy can be requested from the iframe context.
- [ ] Clipboard write failures fall back to a temporary textarea copy attempt.

## Context

Aligned plan: detect terminal selection/copy intent in the iframe, post selected text to the parent, and let the parent write to the OS clipboard.
