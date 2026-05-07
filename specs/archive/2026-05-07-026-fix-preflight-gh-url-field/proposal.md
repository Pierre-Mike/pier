---
id: 026-fix-preflight-gh-url-field
title: Fix preflight htmlUrl→url and add gh-schema contract check
status: archived
kind: workflow
gate: scripts/smoke-preflight-main-ci.ts
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on:
  - 025-preflight-main-ci-gate
supersedes: null
archived: '2026-05-07'
---

## Intent

Restore `/do` worktree-open. Spec 025's preflight requests `htmlUrl` from `gh run list --json`, but real `gh` 2.90.0 emits `url`. The hermetic smoke missed this because the stub bash script echoes whatever JSON the test harness chooses — it never validates the script's `--json` arg against the real gh schema. Fix the field name and extend the smoke with a static contract check that asserts every field in the script's `--json` arg is a known-valid gh field.

## Constraints

- Smoke must remain hermetic (no real `gh` calls) — preserves 025's invariant.
- Contract check uses a static allowed-list of gh field names sourced from `gh run list --json invalid 2>&1` on gh 2.90.0. Updates require an explicit allowed-list edit.
- No behaviour change to `worktree-open.ts`, `worktree-close.ts`, or any other workflow.
- Bug fix is minimal: rename `htmlUrl` → `url` (in the `RunEntry` interface, `--json` argv, error log, and smoke stub JSON).

## Acceptance criteria

- [ ] `scripts/preflight-main-ci.ts` requests `url` (not `htmlUrl`) in its `--json` argv and the `RunEntry` interface
- [ ] `scripts/smoke-preflight-main-ci.ts` Case D parses the script's `--json` arg and asserts every field is in `ALLOWED_GH_FIELDS` (snapshot from gh 2.90.0); fails with a clear diagnostic on unknown field
- [ ] All existing smoke cases (A green, B red, C red+force) still pass after the field rename
- [ ] `bun run tasks:verify` exits 0

## Context

Same-day regression from spec 025 (`workflow(025): Block /do worktree-open when main CI is red`, merged 2026-05-07T20:07:00Z). Discovered 50 minutes post-merge when `/retro` invoked `/do` and worktree-open's preflight failed: `gh exited 1: Unknown JSON field: "htmlUrl"`. Real `gh` 2.90.0 lists allowed fields as: attempt, conclusion, createdAt, databaseId, displayTitle, event, headBranch, headSha, name, number, startedAt, status, updatedAt, url, workflowDatabaseId, workflowName.
