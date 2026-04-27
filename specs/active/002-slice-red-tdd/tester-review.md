# Tester review — 002 (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage
NO

Mapping:
- AC 1 (`findSliceForPath` returns null when no active spec or no match) → tests "returns null when specs/active directory does not exist", "returns null when no active spec exists (empty active dir)", "returns null when file path matches no task gate field" — covered
- AC 2 (`{ taskIndex: N, frozen: false }` when match + sentinel absent) → tests "returns { taskIndex: 1, frozen: false }...", "returns { taskIndex: 2, frozen: false }...", "task index is 1-based..." — covered
- AC 3 (`{ taskIndex: N, frozen: true }` when match + sentinel present) → tests "returns { taskIndex: 1, frozen: true }...", "returns { taskIndex: 2, frozen: true }...", "handles multiple active specs — returns match from correct spec" — covered
- AC 4 (`enforce.ts` pre-tool-use guard uses `findSliceForPath` and blocks writes only when `frozen: true`; old `.gate-frozen` lookup removed) → **UNCOVERED**. The unit gate only tests the pure function. Neither gate file exercises the hook's PreToolUse decision path (allow vs block) and neither asserts the old single `.gate-frozen` is removed/inert.
- AC 5 (`spec:lint` validates per-task `gate:` field: every task has gate, paths unique, indices contiguous from 1) → **PARTIALLY COVERED**. Smoke step 3 only asserts lint passes on a well-formed scaffold. There is no negative case for: missing `gate:` on a task, duplicate gate paths across tasks, or non-contiguous slice indices. The validation rules listed in the AC are not exercised.
- AC 6 (`tasks:verify` skips unfrozen, runs frozen) → smoke steps 4, 6, 8, 10, 12 — covered
- AC 7 (`spec:complete` fails if any sentinel missing OR any gate not green) → **PARTIALLY COVERED**. Step 13 asserts only the green/all-frozen case. The comment "fails without sentinels case is covered implicitly by the RED gate assertions above" is incorrect: those earlier assertions exercise `tasks:verify`, not `spec:complete`. No assertion of `spec:complete` failing when (a) a sentinel is missing or (b) a gate is RED.
- AC 8 (SKILL.md step 5 scaffold-only; step 6 per-slice loop) → **UNCOVERED**. No assertion on SKILL.md content. Arguably testable (grep for absence of gate-file authoring in step 5, presence of per-slice loop in step 6).
- AC 9 (agent docs updated for per-slice scope: `tester-review-<N>.md`, `.gate-frozen-<N>`) → **UNCOVERED**. No assertion on agent doc content.
- AC 10 (templates + constitution updated for per-task gate field) → **UNCOVERED**. No assertion on template/constitution content.

### 2. Adversarial gap
YES

Concrete attack: an implementation can satisfy the unit gate by exporting `findSliceForPath` as a pure function that returns the right shape, while leaving the actual hook PreToolUse handler still consulting the old single `.gate-frozen` (or doing nothing at all). AC 4 is the load-bearing invariant — without it, the new sentinel scheme has no enforcement teeth — yet no test ever drives the hook's allow/block decision. The implementer can ship `findSliceForPath` and never wire it in, and both gates go green.

A second attack: `spec:complete` can be implemented to always pass (or only check that the proposal-level `gate:` runs green) and the smoke still passes step 13, because step 13 only exercises the all-green case. The "fails when sentinel missing" branch of AC 7 has no observer.

A third (subtler) attack: `spec:lint` can be implemented to accept any tasks.md regardless of contiguity/uniqueness/presence of `gate:` field. The smoke only feeds it a valid scaffold; the validation predicates from AC 5 are unobserved.

### 3. Coverage gap
YES

Uncovered testable properties:
- Hook PreToolUse decision: blocks Write/Edit to a frozen slice's gate path; allows Write/Edit when sentinel absent; allows writes to non-gate paths regardless of sentinel state. (AC 4)
- Old single `.gate-frozen` is no longer consulted: presence of a bare `.gate-frozen` file in a spec dir does not block any write. (AC 4, constraint "old single `.gate-frozen` sentinel is removed")
- `spec:lint` rejects tasks.md missing a `gate:` on any task. (AC 5)
- `spec:lint` rejects duplicate gate paths across tasks. (AC 5)
- `spec:lint` rejects non-contiguous slice indices (e.g., 1, 3 with no 2). (AC 5)
- `spec:complete` fails when at least one task's `.gate-frozen-<N>` is missing. (AC 7)
- `spec:complete` fails when all sentinels exist but a gate runs RED. (AC 7) — partly redundant with `tasks:verify` red coverage but `spec:complete` is a separate command/precondition per the AC.

### 4. Behavior vs implementation detail
YES (mostly behavior-pinned, with one minor concern)

Tests assert observable shape (`toEqual({ taskIndex, frozen })`), null returns, and process exit codes. No coupling to internal function names or library error strings. One minor coupling: the unit test imports `findSliceForPath` directly from `./enforce`, which encodes the file location. This is acceptable because the AC literally names "exported from `.claude/hooks/enforce.ts`" — the path IS the contract here, not implementation detail.

Smoke harness shells out to `bun run spec:lint` etc. via package.json scripts pointing at real pier scripts — that's behavior-pinned at the CLI boundary.

## Verdict summary

FAIL. The unit gate cleanly covers the pure-function ACs (1–3), but AC 4 (the hook's actual enforcement behavior — the *whole point* of the spec) has zero coverage in either gate file. AC 5 and AC 7 are only positive-cased; their failure-mode predicates are unobserved, leaving large adversarial windows. ACs 8–10 (doc/template updates) have no assertions at all and should either be covered by grep-style assertions in the smoke or explicitly demoted in proposal.md. The spec-tester needs to add: (a) hook PreToolUse decision tests in the unit gate exercising allow/block on frozen vs unfrozen vs non-gate paths and confirming the old `.gate-frozen` is inert, (b) negative-case `spec:lint` assertions in the smoke (missing gate, duplicate gate, non-contiguous), (c) negative-case `spec:complete` assertions in the smoke (missing sentinel, RED gate), and (d) some form of doc/template assertion for ACs 8–10 or a proposal.md amendment removing them from the AC list.
