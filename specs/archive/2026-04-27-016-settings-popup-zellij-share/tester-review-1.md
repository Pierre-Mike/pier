# Tester review — 002-settings-popup-zellij-share slice 1 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping (slice-1 ACs only — first 5 boxes of proposal.md):
  - AC 1 (reads from `~/.config/pier/zellij-readonly-token` when present)
    → test "returns the token stored in ~/.config/pier/zellij-readonly-token" (line 107) ✓
  - AC 2 (mints via `zellij web --create-read-only-token` when no file exists)
    → tests "calls `zellij web --create-read-only-token` and returns the parsed token" (line 126)
       AND "passes --create-read-only-token (not --create-token) to zellij" (line 140) ✓
  - AC 3 (caches across calls, one in-flight mint)
    → tests "returns the same token on subsequent calls without re-minting" (line 163, asserts spawnCount===1 across Promise.all of 3)
       AND "returns cached value on second sequential call without spawning" (line 184) ✓
  - AC 4 (token file written mode 0600)
    → test "persists the minted token with octal 0o600 permissions" (line 207) ✓
  - AC 5 (separate cache + separate disk path from getZellijToken)
    → tests "reads from zellij-readonly-token, not zellij-token" (line 228)
       AND "resetting module state does not bleed between getZellijToken and getZellijReadOnlyToken caches" (line 252) ✓

### 2. Adversarial gap
NO
Searched. The closest adversarial path: implementation could satisfy AC-3's `spawnCount===1` by using a non-shared mechanism (e.g., a write-then-read-back) rather than a shared in-flight promise. But intent says "one in-flight mint" and the observable proxy is "one spawn"; both concurrent and sequential variants are asserted. No realistic exploit that satisfies all five sets of assertions while violating the stated intent.

### 3. Coverage gap
NO
All 5 slice-1 ACs have at least one direct assertion. The constraint "mirrors getZellijToken — module-local cache, single in-flight mint" is encoded behaviorally via spawn-count assertions rather than by inspecting internals, which is correct.

### 4. Behavior vs implementation detail
YES — tests behavior-pinned.
Assertions target: returned token strings, spawn argv contents, write-call mode field, write/read path suffixes (`endsWith("zellij-readonly-token")`). The token regex format `token_0:  <tok>` mirrors real `zellij` CLI output (already parsed by the existing `getZellijToken` in zellij-auth.ts), so it tests against the external contract, not internal regex shape. Path assertions use `endsWith(...)` rather than full-path equality, so they survive home-directory differences.

## Verdict summary
PASS. Every slice-1 AC has explicit, behavior-pinned coverage. The fs/promises mock + Bun.spawn stub + `__resetZellijAuthForTests` setup isolates the module under test without leaking implementation detail. No structural gaps; minor adversarial concerns are bounded by the AC-3 spawn-count proxy.
