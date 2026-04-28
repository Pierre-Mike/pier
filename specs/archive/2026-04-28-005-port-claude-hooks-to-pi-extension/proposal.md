---
id: 005-port-claude-hooks-to-pi-extension
title: Port Claude hooks to Pi extension
status: archived
kind: code
gate:
  - path: .pi/extensions/claude-hooks-compat.test.ts
    level: unit
  - path: .pi/extensions/claude-hooks-compat.integration.test.ts
    level: integration
created: 2026-04-28
owner: main
depends_on: []
supersedes: null
archived: 2026-04-28
---

## Intent

Port the existing Claude hook safety and observability behavior into a project-local Pi extension so Pi sessions enforce the same repository invariants when editing files or running shell commands.

## Constraints

- Preserve hard pre-tool blocks for protected paths and dangerous bash commands.
- Keep trace output compatible with `.claude/traces/*.jsonl` consumers where practical.
- Use a project-local `.pi/extensions/` extension, not a global extension.
- Do not shell out to the Claude hook dispatcher for every Pi tool call.
- Post-write verification should notify rather than pretend to undo completed writes.

## Acceptance criteria

- [ ] Pi blocks direct edits to `packages/api-contract/**`, `specs/archive/**`, frozen spec gate files, and `apps/backend/wrangler.toml` without an active targeting spec.
- [ ] Pi blocks dangerous bash patterns equivalent to the Claude deny list.
- [ ] Pi emits Claude-trace-compatible jsonl entries for tool calls and blocked calls.
- [ ] Pi surfaces colocated test and lint/typecheck verification feedback after write/edit results without making it a transactional guard.

## Context

Existing Claude hook behavior lives in `.claude/hooks.ts` and `.claude/hooks/*`.
