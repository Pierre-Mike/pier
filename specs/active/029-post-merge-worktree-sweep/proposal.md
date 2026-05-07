---
id: 029-post-merge-worktree-sweep
title: Wire post-merge hook to auto-close merged-spec worktrees
status: active
kind: workflow
gate: scripts/smoke-post-merge-sweep-hook.ts
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
---

## Intent

The `/do` skill documents that "the post-merge hook handles cleanup on `git pull`" — but `lefthook.yml` ships only `pre-commit` and `pre-push` blocks, so no `post-merge` hook actually runs. After every spec merge today (025, 026, 027, 028), the worktree at `.agentic/worktrees/<slug>` was still present after `git pull`, requiring a manual `bun scripts/worktree-close.ts <slug>` to clean up. The auto-sweep behaviour already exists in `worktree-close.ts` (no-args mode walks every `spec/*` branch and closes each that's merged) — we just never wired it to a hook.

## Constraints

- Add a `post-merge:` block to `lefthook.yml` that invokes `bun scripts/worktree-close.ts` (no args → auto-sweep mode).
- No change to `worktree-close.ts`, `worktree-open.ts`, `/do`, or `/retro`. The auto-sweep entrypoint already exists.
- Smoke must be hermetic — no real lefthook hook firing, no real `git pull`. Two assertions: (a) lefthook.yml contains the post-merge block with the right command, (b) `bun scripts/worktree-close.ts` exits 0 with "no merged spec branches" output when invoked in a tmp repo with no spec branches (proves the entrypoint is healthy and exit-clean on the empty case).
- Note in the proposal that landing this spec only takes effect once `bun install` runs and the prepare script reinstalls lefthook hooks (the hook gets registered then). Document in `design.md`.

## Acceptance criteria

- [ ] `lefthook.yml` contains a `post-merge:` block whose command invokes `bun scripts/worktree-close.ts`
- [ ] `scripts/smoke-post-merge-sweep-hook.ts` exits 0 when both assertions hold and exits 1 otherwise
- [ ] `bun run tasks:verify` exits 0
- [ ] Out-of-band: after merge, `bun install` registers the hook; subsequent `git pull` after a spec merge auto-closes that worktree (verified manually on the next retro)

## Context

/retro 2026-05-07 (fifth) finding #1 — formerly deferred-finding #2 of the third retro and #3 of the fourth retro. Carries no new data, only a longer carry-tail. Reproduced four times today: each /retro had to manually `bun scripts/worktree-close.ts` the prior spec's worktree before opening the next one.
