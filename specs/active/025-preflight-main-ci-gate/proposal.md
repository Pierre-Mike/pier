---
id: 025-preflight-main-ci-gate
title: Block /do worktree-open when main CI is red
status: active
kind: workflow
gate: scripts/smoke-preflight-main-ci.ts
created: 2026-05-07
owner: main
depends_on: []
supersedes: null
---

## Intent

Prevent ambient CI debt on `main` from bleeding into new spec branches by failing loudly at worktree-open time when the latest `main` CI run has a FAILURE conclusion.

## Constraints

- Preflight must be hermetic-testable via `PIER_PREFLIGHT_GH_BIN` env-var pointing at a stub binary — no real `gh` calls in the smoke.
- `--force` bypass is mandatory: `preflight-main-ci.ts --force` must exit 0 even when the stub reports FAILURE, and `worktree-open.ts --force` must forward the flag.
- When `gh` is not installed (and `PIER_PREFLIGHT_GH_BIN` is unset), the script must exit 1 with a clear "gh CLI not found" message — but `--force` skips even that check.
- No behaviour change to any other workflow (`worktree-close.ts`, etc.).
- The smoke must not mutate PATH or create any git worktrees.

## Acceptance criteria

- [ ] `scripts/preflight-main-ci.ts` exists, exits 0 on stubbed SUCCESS conclusion
- [ ] `scripts/preflight-main-ci.ts` exits 1 with "main CI is RED" message on stubbed FAILURE conclusion
- [ ] `scripts/preflight-main-ci.ts --force` exits 0 even with stubbed FAILURE
- [ ] `scripts/worktree-open.ts` calls preflight before `git worktree add` and aborts on non-zero (unless `--force` passed)
- [ ] `scripts/smoke-preflight-main-ci.ts` runs hermetically (no real `gh` calls) and asserts all three cases
- [ ] `bun run tasks:verify` runs the smoke and exits 0 once implemented

## Context

/retro 2026-05-07 finding #1: spec 024 carried 7 unrelated drops/zellij debug commits because main CI was red when /do started; same bug paused spec 023.
