# Tester review — 002 (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC 1 (null when no active spec or no match) → tests "returns null when specs/active directory does not exist", "returns null when no active spec exists (empty active dir)", "returns null when file path matches no task gate field", "skips spec dirs that are missing tasks.md", "handles multiple active specs — unrelated path returns null across all specs" ✓
- AC 2 (`{taskIndex:N, frozen:false}` on match + sentinel absent) → "returns { taskIndex: 1, frozen: false }...", "returns { taskIndex: 2, frozen: false }...", "task index is 1-based and matches the ordinal position in tasks.md" ✓
- AC 3 (`{taskIndex:N, frozen:true}` on match + sentinel present) → "returns { taskIndex: 1, frozen: true }...", "returns { taskIndex: 2, frozen: true }...", "handles multiple active specs — returns match from correct spec", "accepts relative filePath resolved against repoRoot" ✓
- AC 4 (hook PreToolUse uses findSliceForPath; blocks only frozen; old `.gate-frozen` inert) → 6 subprocess tests in `describe("hook PreToolUse — allow/block decisions")`: BLOCKS Write frozen, ALLOWS Write unfrozen, ALLOWS Write non-gate path, "old bare .gate-frozen (no -N suffix) is INERT — Write to gate path is ALLOWED", ALLOWS Edit unfrozen, BLOCKS Edit frozen ✓
- AC 5 (`spec:lint` validates per-task `gate:` — present, unique, contiguous) → smoke step 3 (positive on well-formed scaffold) + negative case A (missing gate field, asserts exit≠0 + stderr names task), negative case B (duplicate gate paths, asserts stderr contains shared path "gate-slice-1"), negative case C (non-contiguous indices 1→3, asserts stderr contains "contiguous") ✓
- AC 6 (`tasks:verify` skips unfrozen, runs frozen) → smoke steps 4, 6, 8, 10, 12 covering scaffold (no sentinels), slice-1-frozen-RED, slice-1-green-slice-2-not-frozen, slice-2-frozen-RED, both-green ✓
- AC 7 (`spec:complete` fails on missing sentinel OR RED gate) → step 13 (positive all-green-all-frozen) + negative case D (slice-2 sentinel temporarily moved aside, asserts failure + stderr names "2") + negative case E (slice 1 mutated back to RED with all sentinels in place, asserts failure) ✓

### 2. Adversarial gap
NO — searched, found none structural.

Considered attacks:
- Implementer ships `findSliceForPath` correct but never wires it into the hook → killed by 6 subprocess tests driving `bun .claude/hooks.ts` and asserting exit codes 0/2 at the process boundary.
- Implementer keeps consulting old bare `.gate-frozen` → killed by the "INERT" test that creates a bare `.gate-frozen` and demands Write be ALLOWED (exit 0).
- `spec:lint` accepts any tasks.md → killed by 3 negative cases (missing/duplicate/non-contiguous) each asserting non-zero exit + a content-bearing stderr substring.
- `spec:complete` always passes / only checks proposal-level gate → killed by negative cases D (sentinel removed) and E (gate mutated back to RED).
- `findSliceForPath` resolves via `process.cwd()` instead of `repoRoot` → killed by "accepts relative filePath resolved against repoRoot — no process.cwd() dependency".

Minor non-structural concern: negative case A's `stderrContains: "1"` is a weak substring match (single character), but it is paired with an exit-code-non-zero assertion against a tasks.md that lints clean except for the missing field, so the test cannot pass by accident on a well-formed input. Not a structural gap.

### 3. Coverage gap
NO — none.

ACs 8–10 from attempt 1 have been demoted to a new "Implementation surface" section in proposal.md (lines 42–51) and are no longer acceptance criteria. The remaining 7 ACs each have at least one positive observer and, where the AC has failure-mode predicates (4, 5, 7), at least one negative observer per predicate.

### 4. Behavior vs implementation detail
YES — tests behavior-pinned.

Unit tests use structural equality (`toEqual({ taskIndex, frozen })`) and `toBeNull()`. Hook tests drive the actual hook binary as a subprocess and assert exit codes 0 (allow) and 2 (block) — the documented Claude Code hook block-decision boundary. Smoke shells out to `bun run spec:lint` / `tasks:verify` / `spec:complete` via package.json scripts pointing at real pier scripts; assertions are exit-code based with optional stderr-substring paired checks. The `stderrContains: "contiguous"` substring couples to user-visible error wording for the contiguity rule named in AC 5, which is appropriate CLI-boundary pinning. Import of `findSliceForPath` from `./enforce` is explicitly named in AC 1–3 as the contract, not implementation coupling.

## Verdict summary

PASS. Attempt 2 closes all three named gaps from attempt 1: AC 4 now has 6 hook subprocess tests covering allow/block on frozen vs unfrozen vs non-gate vs legacy-sentinel paths for both Write and Edit; AC 5 has 3 negative `spec:lint` cases (missing/duplicate/non-contiguous); AC 7 has 2 negative `spec:complete` cases (missing sentinel, RED gate). Doc-update ACs were demoted to a non-gated "Implementation surface" section, which is the correct shape for those targets. Tests remain behavior-pinned at process-exit-code and structural-equality boundaries. No structural adversarial gap survived a sincere search. Gate freezes.
