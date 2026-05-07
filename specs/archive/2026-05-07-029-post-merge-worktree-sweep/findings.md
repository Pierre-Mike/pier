# /retro findings (window: 2026-04-30 → 2026-05-07, 17 PRs, 14 specs) — 2026-05-07 (fifth)

Fifth retro of the day. Prior runs:
- 1st: spec 025 — red-main CI gate.
- 2nd: spec 026 — preflight `htmlUrl` → `url` regression fix.
- 3rd: spec 027 — landed `/do-fast` skill bundle.
- 4th: spec 028 — force lefthook install in prepare.

Cleanup phase. Today's finding chain: a real workflow improvement (025), a regression in 025's smoke that hermetic stubs missed (026), the meta-tool bypass that wasn't governed (027), the noisy lefthook conflict that everyone tolerated (028), now the missing hook that the skill docs already promised exists (029).

Spec 028 verifiably worked: this retro's `bun scripts/worktree-open.ts post-merge-worktree-sweep` succeeded silently with `+ typescript@5.9.3 \n 794 packages installed [1.69s]` and zero error wall — first quiet `/do` worktree-open of the day.

## Top finding (acted on by spec 029)

### #1 — Promised post-merge hook never existed

`/do` skill text says "the post-merge hook handles cleanup on `git pull`," and Step 10's report ends with "Run `git pull` — the post-merge hook will auto-clean the local worktree." Reality: `lefthook.yml` ships only `pre-commit` (biome) and `pre-push` (turbo check). There is no `post-merge` block, no `.git/hooks/post-merge` script. After every spec merge today (025, 026, 027, 028, and now this very 029), the worktree was still present after `git pull` and required a manual `bun scripts/worktree-close.ts <slug>`. The auto-sweep code path already exists in `worktree-close.ts` (no-args mode lists `spec/*` branches, closes each that's merged) — we just never wired it.

**Hypothesis**: a previous spec or rough-prototype assumed the hook was wired, and the assumption survived in `/do`'s docstring without ever getting verified.

**Action**: append a `post-merge:` block to `lefthook.yml` invoking `bun scripts/worktree-close.ts`. The hermetic gate asserts (a) lefthook.yml contains the block, (b) the auto-sweep entrypoint exits cleanly on a quiescent tmp repo (proves it won't crash on the most common case — a `git pull` with no merged spec branches).

## Deferred findings

### #2 — Lefthook biome hook silently rolls back commits on lint errors

Twice today (specs 028 and 029) the first commit attempt failed silently with `🥊 biome` output but no clear "commit aborted" line — the user (me) thought the commit succeeded based on the apparent staging output, only to find the working tree dirty and HEAD unchanged. The biome failure was real (`noUnusedImports` errors after import changes during dev), but the failure mode is hidden behind RTK's `ok 5 files changed` line which makes it look like a successful commit. **Defer**: low-impact for humans (visible in next git status), high-impact for autonomous agents (silent rollback breaks naive commit-then-proceed flows). Possible action: a `commit-message` hook or a wrapper that emits a clear "COMMIT REJECTED" line when biome exits non-zero.

### #3 — `git pull` aborts when a spec lands files that previously existed locally as untracked (carries from 4th retro)

Reproduces deterministically when the user authors meta-tools in `~/Github/pier/.claude/...` to test in-session, then a spec branch re-creates the same files. Carries unchanged. **Defer**.

### #4 — `gh pr merge --auto` silently rejects "clean status" PRs (carries from 3rd, 4th retros)

Three retros now without action. PR 44 (spec 028) merged cleanly via auto-merge despite `autoMergeRequest: null` in the GraphQL response — so the message may be cosmetic. **Defer**: filing upstream.

### #5 — Workflow-kind specs skip judge → no `tester-review.md` (carries)

All five of today's specs are kind: workflow. None have rubric review. **Defer**: documentation finding only.

### #6 — Tooling friction effectively zero across in-window traces (carries)

No new data. **Defer**: trace-capture audit.
