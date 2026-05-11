# Retro findings (window: 2026-05-04 → 2026-05-11)

## Finding 1 — Acted on by this spec

3-spec regression chain in 24h on frontend file-tree feature area:
- 040 lazy-load-file-tree (#57): shipped green → broke palette + sidebar at integration layer
- 041 palette-file-search (#58): shipped green → broke page-composition wiring
- 042 wire-palette-sidebar (#59): hotfix for 041's regression

Each spec passed its gate (unit + integration with mocked deps), but the bug lived at the page-composition layer — index.astro wiring + refreshFiles → renderFileTree coupling. No unit gate ever exercises a real DOM with the real store and the real installPalette call together.

Action: require an apps/e2e/tests/*.spec.ts gate entry on any kind:code spec touching apps/frontend/src/pages/** or apps/frontend/src/dashboard/**. Enforced via a new check in scripts/spec-lint.ts.

## Finding 2 — Deferred

spec-lint doesn't catch duplicate IDs across archive when IDs are reused. Example: 036 appears twice in specs/archive/ (2026-05-08-036-fix-session-cwd-project and 2026-05-09-036-e2e-smoke). Worth a separate rule spec to extend the duplicate-id check across the full archive.

## Finding 3 — Deferred

Stale git stash debris from worktree:open survived 4+ days unnoticed; surfaced only when `git pull` failed. Worth a pre-pull or worktree:open warning if stash list has aged entries — a workflow-kind spec adding a small check.
