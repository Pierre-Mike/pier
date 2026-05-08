# /retro findings (window: 2026-05-01 → 2026-05-08, 20 PRs, 17 specs) — 2026-05-08 (eighth)

Eighth retro overall. Prior chain (025 → 031): each retro fixed friction discovered in the previous one. The chain has now retired the most-impactful failures of the `/do` happy path — preflight blocks bad pulls, lefthook installs cleanly in fresh worktrees, post-merge sweeps merged worktrees, biome rejection is loud, and unused-import auto-fix lands in pre-commit without `--unsafe`. Remaining friction is increasingly second-order.

## Top finding (acted on by spec 032)

### #1 — `gh pr merge --auto` rejection is non-deterministic — sample size now decisive

Five-retro carry-tail. Today's runs:
- PR 42 (spec 026): auto-merged cleanly.
- PR 43 (spec 027): rejected ("clean status"), required user-authorized squash-merge.
- PR 44 (spec 028): auto-merged cleanly (despite local cleanup error noise).
- PR 45 (spec 029): rejected, required user-authorized squash-merge.
- PR 46 (spec 030): auto-merged cleanly.
- PR 47 (spec 031): rejected, required user-authorized squash-merge.

Three out of six PRs rejected with the same "Pull request is in clean status (enablePullRequestAutoMerge)" GraphQL message. The pattern: when the PR's mergeable state flips from "behind" to "clean" before our `--auto` call lands, gh returns the message and `autoMergeRequest` stays null. The harness's "never merge directly" rule (enforced by a permission hook) means each rejection requires explicit user authorization — three interruptions today alone.

**Hypothesis**: race between gh's mergeable-state evaluation and the auto-merge-enable RPC. The PR creation step transitions the PR through `UNKNOWN → BEHIND → CLEAN` over ~1-3s; if `--auto` lands during the CLEAN window, gh refuses (auto-merge can't enable on an already-mergeable PR — there's nothing to wait for).

**Action**: ship `scripts/pr-merge-auto.ts` — invokes `--auto`, polls `autoMergeRequest` for up to 10s, prints one of two single-line outcomes (`✓ auto-merge queued` / `✖ AUTO-MERGE NOT QUEUED — wait for CI green, then run: gh pr merge --squash --delete-branch <pr>`). Hermetic gate covers both stub scenarios. Wrapper is opt-in; a follow-up spec wires it into `/do` Step 8 once shadow-validated on real PRs.

## Deferred findings

### #2 — `git pull` aborts when a spec lands files that previously existed locally as untracked (carries from 4th, 5th, 6th, 7th)

Six retros now without action. Last triggered after spec 027 merged. Reproduces only when authoring meta-tools in `~/Github/pier/.claude/...` to test in-session. **Defer**: niche, but consider `/do` Step 4 moving such files into the worktree at create time.

### #3 — `/do` SKILL.md should adopt the new wrapper (NEW, follow-up to #1)

Once 032 lands and the wrapper is shadow-validated on the next 2-3 PRs (i.e. invoke `bun scripts/pr-merge-auto.ts <pr>` manually to confirm real-world behaviour), update `/do` Step 8 to call the wrapper instead of bare `gh pr merge --auto`. Same change for `/do-fast`. **Defer**: needs validation runs first.

### #4 — Workflow-kind specs skip judge → no `tester-review.md` (carries)

All eight specs from 025 onward kind: workflow. Documentation-only finding. **Defer**.

### #5 — Tooling friction effectively zero across in-window traces (carries)

No new data; verify trace capture before celebrating. **Defer**.
