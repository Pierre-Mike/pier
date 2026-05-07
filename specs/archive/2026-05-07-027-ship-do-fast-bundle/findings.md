# /retro findings (window: 2026-04-30 → 2026-05-07, 15 PRs, 12 specs) — 2026-05-07 (third)

Third retro of the day. Earlier two:
- First: spec 025 (red-main CI gate) merged 20:07Z.
- Second: spec 026 (preflight `htmlUrl` → `url` regression fix) merged 21:23Z.

This run picks up the still-deferred top finding from the second retro: the `/do-fast` skill bundle was sitting on main's working tree as untracked files.

## Top finding (acted on by spec 027)

### #1 — `/do-fast` bundle authored without spec governance

Three uncommitted paths sat on main as of `git pull` 21:23Z (post-merge of 026):
- `.claude/skills/do-fast/SKILL.md` (5.9K)
- `.claude/agents/do-fast-orchestrator.md` (194 lines)
- `.claude/agents/spec-fielder.md` (111 lines)

These extend the harness — a new skill plus two subagents that together implement `/do-fast`, a faster `/do` variant. Authored during the 2026-05-05/06 orchestrator-app session (trace `e43a4f72`, ~75K, 224 events, 0 failures). Skipping the spec rails to author the very tool that streamlines those rails is the meta-bypass we want to close.

**Hypothesis**: meta-tools that augment the spec workflow tend to skip it during authorship — there is no rule or hook enforcing "harness changes go through /do." Until 027 lands, no record of intent / acceptance / gate exists for `/do-fast`.

**Action**: copy the three files onto a spec branch via `/do`. Add a hermetic smoke that asserts each file exists and parses its frontmatter (skill: `name` + `description`; agents: `name`). Future changes to the bundle land on their own specs.

## Deferred findings

### #2 — Worktree post-merge cleanup didn't fire

After PR 42 (spec 026) merged at 21:23Z and the user ran `git pull` from `~/Github/pier`, `git worktree list` still showed the spec worktree at `.agentic/worktrees/fix-preflight-gh-url-field`. The `/do` skill says "the post-merge hook handles cleanup on `git pull`" but in practice this retro had to invoke `bun scripts/worktree-close.ts fix-preflight-gh-url-field` manually before opening the next worktree. **Defer**: investigate post-merge hook (likely lefthook config or the hook script's branch-vs-worktree logic). Could be the same lefthook `core.hooksPath` conflict that breaks `bun install` inside new worktrees.

### #3 — `bun install --frozen-lockfile` fails inside fresh worktrees

`worktree-open.ts` runs `bun install --frozen-lockfile` after creating the worktree. It fails because `lefthook install` exits non-zero with `core.hooksPath is set locally to '/Users/pierre-mikel/Github/pier/.git/hooks'`. The script prints "worktree left in place for diagnostic" so the worktree is still usable, but every spec start emits a noisy error wall and skips dependency install. Reproduces on both 026 and 027 worktree opens. Hypothesis: the project's git config has a per-repo `core.hooksPath` override that conflicts with lefthook's bare-prefix install. **Defer**: candidate next-retro action — either drop the override or run `lefthook install --reset-hooks-path` in worktree-open. Workaround works.

### #4 — `gh pr merge --auto` returned a "clean status" GraphQL error on PR 42

Running `gh pr merge --auto --squash --delete-branch` for PR 42 (spec 026) returned `GraphQL: Pull request Pull request is in clean status (enablePullRequestAutoMerge)` even though CI was IN_PROGRESS at the moment. The merge nonetheless succeeded (PR merged 21:23Z, 4/4 checks). The error message looks like a status enum being surfaced as text. **Defer**: cosmetic — auto-merge worked. Worth reporting to gh upstream if reproducible across PR templates.

### #5 — Workflow-kind specs skip judge → no `tester-review.md`

Carries forward from the second retro. 025/026 (workflow kind) have no `tester-review.md`; 021–024 (code/feat) have 2.8–4.6K each. Per `/do` Step 2.5 dispatch table, workflow specs intentionally skip the judge. The implication for retrospective signal: rubric scores are missing for half the specs. **Defer**: documentation finding only; no observable harm. Could elevate to a writeup spec if the auto-optimize loop wants per-kind rubric data.

### #6 — Tooling friction effectively zero across in-window traces

Carries forward from the second retro. ~700+ tool events, 0 `tool_use_error`, 0 hook blocks, 0 failed Edit/Write/Bash. Either the harness is rock-solid or the trace schema isn't capturing failures. **Defer**: verify trace capture before celebrating.
