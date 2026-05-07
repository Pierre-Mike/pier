# /retro findings (window: last 7 days, 14 merged PRs, 5 specs) — 2026-05-07

## Top finding (acted on by spec 025)

### #1 — CI debt bleeds into the next spec's branch

Spec 024 (gitignored files muted color, scope: file tree color) shipped with 9 commits on `spec/gitignored-files-muted-color` — only 2 are spec work. The other 7 are `debug(drops):` / `fix(drops):` / `fix(zellij-test):` cleanup of a pre-existing drops multipart bug on `main`. Same bug paused PR #39 (spec 023) for hours. Even worse: one of the merged commits (`6554d61`) is literally titled `debug(drops): log bodyRaw shape for CI diagnostic — temporary` — a throwaway log-line commit landed in main history. Hypothesis: nothing checks main CI is green before `/do` opens a new worktree; the same red bug bit two consecutive specs.

**Action**: workflow-kind preflight script wired into `worktree-open.ts`. See proposal.md.

## Deferred findings

### #2 — `tester-review.md` is always 0 bytes on PASS

All 5 archived specs in window have empty tester-review.md files. Either the judge has nothing to say on PASS (current behavior), or rubric scores should be persisted for retro-time signal. Low leverage; defer.

### #3 — High burst velocity (5 specs in 1 day, 2026-05-07)

No signal of contention or quality dip beyond #1. Defer.
