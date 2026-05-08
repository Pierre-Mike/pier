---
id: 030-loud-commit-rejection
title: Make lefthook biome rejection visibly fail commits
status: active
kind: workflow
gate: scripts/smoke-loud-commit-rejection.ts
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
---

## Intent

When the lefthook pre-commit biome step exits non-zero (e.g. `noUnusedImports` after a refactor), the commit aborts but the failure is masked behind RTK wrapper output (`ok N files changed, ...`) and biome's verbose lint report. Twice during the previous retro chain (specs 028, 029) the autonomous agent assumed `git commit` had succeeded based on the apparent log line, only to discover the working tree was still dirty. Wrap the biome command so that any non-zero exit prints a single explicit `✖ COMMIT REJECTED — biome lint failed; see log above and re-stage after fixing` line on stderr. Reduces the cognitive load of parsing biome's color-coded output to a single deterministic signal.

## Constraints

- One-line edit to `lefthook.yml`'s biome command — append `|| (echo "✖ COMMIT REJECTED — biome lint failed; see log above and re-stage after fixing" >&2; exit 1)`.
- No change to biome configuration, no `--unsafe`, no `--write` mode change. The fix is purely about output legibility, not lint policy.
- Smoke is hermetic — runs `bunx biome check --write --no-errors-on-unmatched <fixture>` against a tmp TS file with a deliberately-unfixable biome error, asserts the exact `COMMIT REJECTED` line is present on stderr.
- The smoke must also assert the wrapper passes through clean cases (a valid TS file → no `COMMIT REJECTED` line, exit 0).

## Acceptance criteria

- [ ] `lefthook.yml` biome command ends with `|| (echo "✖ COMMIT REJECTED — biome lint failed; see log above and re-stage after fixing" >&2; exit 1)`
- [ ] `scripts/smoke-loud-commit-rejection.ts` exits 0 when both wrapper assertions hold and exits 1 otherwise
- [ ] `bun run tasks:verify` exits 0
- [ ] Out-of-band: re-running `bun install` reinstalls hooks; subsequent failed commit shows the rejection line (verified manually next retro)

## Context

/retro 2026-05-08 (sixth) finding #1 — formerly deferred-finding #2 of the fifth retro. Burned the autonomous agent twice in the same day. Surgical fix scoped to commit-failure visibility; broader changes (biome `--unsafe`, agent CLAUDE.md guidance) are deferred.
