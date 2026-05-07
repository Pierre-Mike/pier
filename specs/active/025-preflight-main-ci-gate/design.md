# Design

Pure-bun script, env-var-pointed gh shim for hermetic testing, narrow `--force` plumb-through.

## Approach

Add `scripts/preflight-main-ci.ts` that shells out to `gh run list` (or `PIER_PREFLIGHT_GH_BIN` override) and parses the JSON result. Wire it into `scripts/worktree-open.ts` before `git worktree add`. Gate: `scripts/smoke-preflight-main-ci.ts` creates stub binaries in a tmpdir and verifies all three exit-code cases hermetically.

## Files touched

- `scripts/preflight-main-ci.ts` — new; CI preflight logic with `PIER_PREFLIGHT_GH_BIN` override and `--force` bypass
- `scripts/smoke-preflight-main-ci.ts` — new (gate); hermetic smoke exercising green / red / red+force cases
- `scripts/worktree-open.ts` — modify: parse `--force`, call preflight before `git worktree add`, abort on non-zero exit unless `--force`
- `package.json` — no change needed; `tasks:verify` already runs gate scripts via `scripts/tasks-verify.ts`

## Decisions

- **Env-var stub over PATH override** — `PIER_PREFLIGHT_GH_BIN` is cleaner than mutating PATH inside a smoke; follows `GIT_SSH_COMMAND` pattern; reusable by future tests.
- **`--force` lives on `preflight-main-ci.ts`** — bypass logic in one place; `worktree-open.ts` just forwards. Makes smoke hermetic: only `preflight-main-ci.ts` needs testing for the force case.
- **Smoke matches `smoke-023-session-cwd.ts` style** — plain `#!/usr/bin/env bun`, no test framework, `console.error + process.exit(1)` on failure, `console.log("smoke-025: PASS")` on success.
- **No `bun:test` / `describe` / `it`** — existing smoke pattern is plain script; match it.

## Risks

- `gh` CLI version variance in the JSON output shape — mitigated by only reading `.[0].conclusion` and `.[0].status`; any extra fields are ignored.

## Out of scope

- Updating `/do` skill markdown to document `--force` flag.
- Reformatting or refactoring other smoke scripts.
- Teaching `ci-feedback.ts` about preflight.
- Handling `gh` rate limits or auth failures (treated as unexpected non-zero exit — gate will block with a generic message).
