# /retro findings (window: 2026-05-01 → 2026-05-08, 18 PRs, 15 specs) — 2026-05-08 (sixth)

Sixth retro overall, first of 2026-05-08. Prior chain (all 2026-05-07):
- 1st: 025 — red-main CI gate.
- 2nd: 026 — preflight `htmlUrl` → `url` regression fix.
- 3rd: 027 — landed `/do-fast` skill bundle.
- 4th: 028 — force lefthook install in prepare.
- 5th: 029 — wired post-merge hook to auto-close merged worktrees.

First post-`bun install` cycle: spec 029's post-merge hook is now installed. Confirmed empirically — `git pull` at session start auto-cleaned the prior worktree (`git worktree list` showed no leftover before this retro started, and no manual `worktree-close` invocation was needed). One layer of friction permanently retired.

## Top finding (acted on by spec 030)

### #1 — Lefthook biome hook silently rolls back commits

When the pre-commit biome step exits non-zero (e.g. `noUnusedImports` after a refactor), the commit aborts but the failure is masked behind RTK wrapper output (`ok N files changed, …`) and biome's color-coded lint report. Twice during the previous retro chain (specs 028 and 029) the autonomous agent assumed `git commit` had succeeded based on the apparent log line, only to discover working tree dirty + HEAD unchanged. Each time, the recovery was a 30-second loop — re-run biome, fix the unused import, retry the commit — but in a longer-running autonomous flow the silent failure could compound (apply unrelated changes on top of the dirty tree, etc.).

**Hypothesis**: terminal-final wrappers (RTK in this case) and verbose lint output between them swallow the single-line "commit aborted" signal that git itself emits. Autonomous agents pattern-match on "ok N files changed" without scanning for biome's failure marker.

**Action**: append a shell-OR clause to lefthook's biome `run:` line that prints a single explicit `✖ COMMIT REJECTED — biome lint failed; see log above and re-stage after fixing` line on stderr when biome fails. Single deterministic signal, no other behaviour changes. Hermetic gate: contract check that lefthook.yml has the wrapper + behavioural experiment with a fixture `noExplicitAny` file proving the marker fires on rejection AND doesn't fire on a clean file.

## Deferred findings

### #2 — biome flags safe-to-fix lints (e.g. `noUnusedImports`) as "unsafe", blocking auto-fix in pre-commit

Related to #1's root cause but distinct as an action. Adding `--unsafe` to the biome pre-commit run would auto-remove unused imports in dev (the most common trigger of #1), eliminating the rollback class entirely rather than just signalling it. **Defer**: broader risk surface — `--unsafe` enables ALL unsafe fixes including potential semantic changes. Worth a follow-up spec that whitelists specific rules' unsafe fixes via biome.json overrides if biome supports per-rule safety control.

### #3 — `git pull` aborts when a spec lands files that previously existed locally as untracked (carries from 4th, 5th)

Reproduced once in the prior pull (after spec 027 merged). Carries unchanged. **Defer**.

### #4 — `gh pr merge --auto` silently rejects "clean status" PRs (carries from 3rd, 4th, 5th)

Four retros now without action. Two PRs today (43, 45) needed user-authorized squash-merge to land. The "clean status" GraphQL response is consistently followed by either silent success or silent rejection — non-deterministic from the caller's perspective. **Defer**: candidate for a `gh pr merge` wrapper script that tries `--auto`, falls back to direct `--squash` after CI green confirmation. Would require explicit user policy on when direct merge is acceptable.

### #5 — Workflow-kind specs skip judge → no `tester-review.md` (carries)

All six of today/yesterday's specs are kind: workflow. None have rubric review. Per `/do` Step 2.5 dispatch table this is intentional. **Defer**: documentation-only finding.

### #6 — Tooling friction effectively zero across in-window traces (carries)

No new data. **Defer**: trace-capture audit.
