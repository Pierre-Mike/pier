---
id: 028-fix-lefthook-prepare-force
title: Force lefthook install in prepare to unblock fresh worktrees
status: active
kind: workflow
gate: scripts/smoke-prepare-lefthook-with-hookspath.ts
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
---

## Intent

Every `bun scripts/worktree-open.ts <slug>` invocation runs `bun install --frozen-lockfile` in the new worktree, which triggers the root `prepare` script (`bunx lefthook install`). lefthook detects a pre-existing `core.hooksPath` setting on the shared `.git/config` and refuses to install, exiting non-zero. `worktree-open.ts` then prints a noisy error wall and leaves the worktree in place for diagnostic. Reproduces on every spec start (observed on 026, 027, 028 worktree opens). Pass `--force` in the prepare command so lefthook unconditionally installs into the existing hooks path — eliminates the noise and ensures dependency install completes.

## Constraints

- Only one character of behavioural change: append `--force` to the root `prepare` script.
- No change to `worktree-open.ts` or any spec workflow.
- Smoke must be hermetic — creates a tmp git repo, sets `core.hooksPath` on it, runs `bunx lefthook install --force` against that tmp dir, asserts exit 0 and hooks-path stays the conflicting value (proves `--force` honored the existing path rather than overwriting `core.hooksPath`).
- No effect on contributors who don't have `core.hooksPath` set — `--force` is a no-op for the clean case.

## Acceptance criteria

- [ ] `package.json` root `prepare` script reads `bunx lefthook install --force`
- [ ] `scripts/smoke-prepare-lefthook-with-hookspath.ts` exits 0 with `--force` and exits 1 without it (proves the smoke catches the regression class)
- [ ] `bun run tasks:verify` exits 0
- [ ] Out-of-band: re-running `bun scripts/worktree-open.ts <some-slug>` succeeds without the lefthook error wall (verified manually post-merge)

## Context

/retro 2026-05-07 (fourth) finding #1 — formerly deferred-finding #3 of the third retro. Reproduced on every `/do` invocation in the day's three prior specs (026, 027, 028 itself). Lefthook hint output suggests two alternatives — `--reset-hooks-path` (mutates git config) or `--force` (no mutation). `--force` is chosen because it leaves the user's git config untouched.
