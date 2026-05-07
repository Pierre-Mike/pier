# /retro findings (window: 2026-04-30 → 2026-05-07, 16 PRs, 13 specs) — 2026-05-07 (fourth)

Fourth retro of the day. Prior runs:
- 1st: spec 025 — red-main CI gate.
- 2nd: spec 026 — preflight `htmlUrl` → `url` regression fix.
- 3rd: spec 027 — landed `/do-fast` skill bundle.

Each /retro converges the loop one more turn. Today's pattern: every retro produced exactly one merged PR and surfaced the next-most-leverage finding for the next iteration.

## Top finding (acted on by spec 028)

### #1 — Lefthook hooksPath conflict breaks `bun install` in every fresh worktree

`worktree-open.ts` runs `bun install --frozen-lockfile` after `git worktree add`. The root `prepare` script is `bunx lefthook install`, which detects a pre-existing `core.hooksPath = .git/hooks` setting on the shared git config and exits non-zero. `bun install` then fails with `prepare script from "piguy-web" exited with 1`. Reproduces on every spec start in 026, 027, and 028 worktree opens. The error wall is noisy but the worktree is left in place, so manual workflow continues — invisible to anyone using the spec rails as documented.

**Hypothesis**: the lefthook install hint suggests two fixes — `--reset-hooks-path` (mutates git config) or `--force` (no mutation). The prepare script never adopted either.

**Action**: append `--force` to the root `prepare`. Add a hermetic smoke that creates a tmp git repo with `core.hooksPath` set, runs `bunx lefthook install` both with and without `--force`, asserts that `--force` succeeds and bare-`install` fails (so the test self-validates against future lefthook upstream changes).

## Deferred findings

### #2 — `git pull` aborts when a spec lands files that previously existed locally as untracked

After spec 027 merged at 21:46Z, running `git pull` from `~/Github/pier` failed with `error: The following untracked working tree files would be overwritten by merge: .claude/agents/do-fast-orchestrator.md, .claude/agents/spec-fielder.md, .claude/skills/do-fast/SKILL.md`. The retro had to manually `rm` the three files (after diff-verifying they matched origin) before pulling. Hypothesis: when authoring meta-tools that augment the harness, the natural workflow is to author them in `~/Github/pier/.claude/...` directly to test them in-session; the spec branch then re-creates the same files and merge-conflicts on pull. **Defer**: low frequency. Possible action: extend `worktree-open.ts` or a helper to `mv` such files into the worktree at creation time so the originals stop existing on main's working tree. Or add an `untracked-shadow` check to the `git pull` post-merge hook.

### #3 — Worktree post-merge cleanup didn't fire (carries forward)

Same as third retro's deferred #2. After 027 merged + `git pull`, the worktree at `.agentic/worktrees/ship-do-fast-bundle` was still present; manual `bun scripts/worktree-close.ts` invocation needed. **Defer**: post-merge hook investigation.

### #4 — `gh pr merge --auto` silently rejects "clean status" PRs (carries forward)

Same as third retro's deferred #4. Reproduced on PR 43 (spec 027): `autoMergeRequest: null` after queueing, even though CI was IN_PROGRESS. The third retro escalated to a direct `gh pr merge --squash` (with one-shot user permission). **Defer**: cosmetic; merge worked. Worth filing upstream if reproducible.

### #5 — Workflow-kind specs skip judge → no `tester-review.md` (carries forward)

Three retros now without rubric content for workflow specs (025, 026, 027, 028 all kind: workflow). Per `/do` Step 2.5 dispatch table this is intentional. **Defer**: documentation finding only.

### #6 — Tooling friction effectively zero across in-window traces (carries forward)

Same as third retro's deferred #6. Carries forward without movement. **Defer**: verify trace capture.
