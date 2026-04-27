---
id: "002"
title: Convert /do from batch-RED to slice-RED TDD
status: active
kind: code
gate:
  - path: .claude/hooks/enforce.test.ts
    level: unit
  - path: scripts/smoke-slice-tdd.ts
    level: e2e
created: 2026-04-27
owner: main
depends_on: []
supersedes: null
---

## Intent

The `/do` skill currently authors all failing tests in a single batch before any implementation begins. This spec replaces that batch-RED pass with a per-slice TDD loop: the scaffold (proposal + design + tasks) is authored once, then each task slice goes through its own RED→judge→GREEN cycle before the next slice begins. Test design is informed by what the previous slice taught us, partial progress is observable on `tasks:verify` (slices 1..N green, slice N+1 red), and the self-collusion gate remains intact at slice granularity by pairing each `.gate-frozen-<N>` sentinel with a single gate file path declared in that task's `gate:` field.

## Constraints

- TypeScript strict mode, `noUncheckedIndexedAccess: true`, no `any`, no `as` casts outside test files (constitution §5).
- Hook (`enforce.ts`) must remain pure-function-testable: the new `findSliceForPath` export accepts `{ filePath, repoRoot }` and performs no I/O beyond what is passed in via the filesystem path — specifically it must not call `process.cwd()` internally (constitution §2, §6).
- FCIS layering: pure functions in core, I/O at the shell boundary (constitution §6).
- No tasks.md shape backward compatibility needed — no in-flight specs use the old shape at the time this spec lands.
- The old single `.gate-frozen` sentinel is removed; the new per-slice `.gate-frozen-<N>` scheme replaces it entirely.
- `spec:lint` must accept the new per-task `gate:` field in tasks.md.
- `tasks:verify` must be slice-aware: only run gates for slices whose `.gate-frozen-<N>` sentinel exists; partial green (slices 1..N pass, N+1 not yet frozen) is the normal mid-spec state.
- `spec:complete` precondition: every task has a sentinel AND every gate runs green.

## Acceptance criteria

- [ ] AC 1: `findSliceForPath({ filePath, repoRoot })` exported from `.claude/hooks/enforce.ts` returns `null` when no active spec exists or the path matches no task gate.
- [ ] AC 2: `findSliceForPath` returns `{ taskIndex: N, frozen: false }` when path matches task N's gate and `.gate-frozen-N` does not exist.
- [ ] AC 3: `findSliceForPath` returns `{ taskIndex: N, frozen: true }` when path matches task N's gate and `.gate-frozen-N` exists.
- [ ] AC 4: `enforce.ts` pre-tool-use guard uses `findSliceForPath` and blocks Write/Edit to a task's gate path only when `frozen: true`; the old single `.gate-frozen` lookup is removed (bare `.gate-frozen` without `-N` suffix is inert).
- [ ] AC 5: `spec:lint` validates per-task `gate:` field: every task has a `gate:` referencing a unique path; slice indices contiguous from 1.
- [ ] AC 6: `tasks:verify` skips gate enforcement for slices whose `.gate-frozen-<N>` does not exist; runs the gate for slices whose sentinel exists.
- [ ] AC 7: `spec:complete` fails if any task is missing its `.gate-frozen-<N>` sentinel or any gate is not green.

## Implementation surface

The following files must be updated as part of implementing this spec. They are not gated assertions but required implementation targets (enforced via `tasks.md` `file_targets` and boundary checks):

- `.claude/skills/do/SKILL.md` — step 5 becomes scaffold-only (no gate files); step 6 becomes the per-slice loop (tester→judge→implementer per slice).
- `.claude/agents/spec-tester.md` — updated for per-slice scope (`tester-review-<N>.md`, `.gate-frozen-<N>`).
- `.claude/agents/spec-judge.md` — updated for per-slice review using `tester-review-<N>.md` and `.gate-frozen-<N>`.
- `.claude/agents/spec-implementer.md` — updated for per-slice implementation loop.
- `specs/_template/proposal.md` and `specs/_template/tasks.md` — updated to reflect per-task gate field shape.
- `specs/constitution.md` §4 — updated to reflect per-task gate field.

## Context

Aligned plan: see dispatch prompt for this spec (2026-04-27 `/do` session, spec 002).
