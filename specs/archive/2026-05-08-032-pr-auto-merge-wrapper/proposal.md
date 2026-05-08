---
id: 032-pr-auto-merge-wrapper
title: Wrap gh pr merge --auto with clear visibility on silent rejection
status: archived
kind: workflow
gate: scripts/smoke-pr-merge-auto.ts
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-08'
---

## Intent

`gh pr merge --auto --squash --delete-branch` returns a GraphQL message `Pull request Pull request is in clean status (enablePullRequestAutoMerge)` when the PR's mergeable state has flipped from "behind" to "clean" before the auto-merge call lands. Outcome is non-deterministic: PR 46 (spec 030) auto-merged cleanly, PR 47 (spec 031) silently rejected. Five retros in a row recorded the same race without a fix landing — today alone, PRs 45 and 47 both required user-authorized manual squash-merge to land. Add `scripts/pr-merge-auto.ts`: invoke `gh pr merge --auto`, then poll `gh pr view --json autoMergeRequest` for up to 10 seconds, and print one of two single-line outcomes — `✓ auto-merge queued for <url>` or `✖ AUTO-MERGE NOT QUEUED — wait for CI green, then run: gh pr merge --squash --delete-branch <number>`. No silent ambiguity, no GraphQL noise. The wrapper is opt-in for now; a follow-up spec can update `/do` Step 8 to call it.

## Constraints

- Wrapper exits 0 in BOTH outcomes — auto-queued and not-queued. Failure to queue is not a script error; it's a state to surface.
- No bypass of the `never merge directly` harness rule. The wrapper only attempts `--auto`; the fallback path is a printed instruction the user reviews before running.
- Smoke is hermetic — uses `PIER_PR_MERGE_GH_BIN` env var (mirroring spec 025's `PIER_PREFLIGHT_GH_BIN` pattern) to point the wrapper at a stub `gh`. Two scenarios: (a) stub succeeds → wrapper prints "queued"; (b) stub returns the "clean status" message and `view` reports `autoMergeRequest: null` → wrapper prints "NOT QUEUED" with the manual command.
- No change to `/do` SKILL.md or any other harness file. This spec lands the wrapper as an isolated tool. Adoption in `/do` is a separate spec, sized to verify the wrapper in shadow first.

## Acceptance criteria

- [ ] `scripts/pr-merge-auto.ts` exists, accepts a PR number or URL, supports `PIER_PR_MERGE_GH_BIN` env var
- [ ] `scripts/smoke-pr-merge-auto.ts` exits 0 with both "queued" and "NOT QUEUED" stub scenarios producing the expected single-line outcome
- [ ] `bun run tasks:verify` exits 0
- [ ] Out-of-band: invoking `bun scripts/pr-merge-auto.ts <some-real-PR>` prints one of the two outcomes against real `gh` (verified manually next retro)

## Context

/retro 2026-05-08 (eighth) finding #1 — formerly deferred-finding #3 of the seventh retro and #4 of the third/fourth/fifth retros. Five-retro carry-tail. Both of today's manual squash-merges (PRs 45, 47) were preventable if the wrapper had existed. Recording the race is enough leverage to act.
