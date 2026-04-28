---
id: 003-replace-unsafe-isnan
title: Replace unsafe isNaN in retro preflight
status: archived
kind: rule
gate: scripts/gates/no-global-isnan-retro-preflight.ts
created: 2026-04-28T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-04-28'
---

## Intent

Remove the unsafe global `isNaN` usage in `scripts/retro-preflight.ts` so the preflight script follows the repository's Biome rule expectations without changing runtime behavior.

## Constraints

- Change only the retro preflight cleanup target during implementation.
- Preserve behavior for numeric timestamps returned by `Date#getTime()`.
- Do not touch app runtime code.

## Acceptance criteria

- [ ] `scripts/retro-preflight.ts` no longer calls global `isNaN`.
- [ ] The gate script passes by checking for `Number.isNaN(commitMs)`.
- [ ] `bun run tasks:verify` passes for this active spec.

## Context

Biome reports `lint/suspicious/noGlobalIsNan` for `scripts/retro-preflight.ts:153`. The cleanup is a deterministic lint-rule fix: `isNaN(commitMs)` should become `Number.isNaN(commitMs)`.
