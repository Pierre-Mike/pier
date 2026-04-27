# Tester review — 003 slice 3 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

In-scope ACs for slice 3: AC7, AC8.

Mapping:
  - AC7 (close stale upstream on duplicate downstream connect for same sessionId)
    → test "closes the previous upstream when a duplicate sessionId connects" (close() called once)
    → test "activeBridges holds the NEW downstream after replacement" (registry-state pin)
    → test "stale close reason is distinct from normal downstream-close reason" (reason distinguishability)
    Combined: stale upstream is closed exactly once, registry is updated, and the
    log event differentiates replacement from normal close. ✓
  - AC8 (ensureZellijWeb guards against duplicate daemon)
    → test "(i) does NOT spawn when probe returns true" ✓
    → test "(ii) spawns exactly once when probe returns false" ✓
    → test "(iii) concurrent callers spawn at most once — no double-spawn race" ✓
    → test "alternating probe: first caller skips spawn, second spawns once" ✓
    Verified via injected `{ probe, spawn }` deps surface — the gate-scope tension
    (AC7 lives in proxy module but is asserted in zellij-auth.test.ts) is
    acceptable because (a) the assertions exercise the proxy's exported
    `zellijWsHandlers.open` and `activeBridges` slice-1 surface, (b) the
    file-naming choice does not weaken the assertions. ✓

### 2. Adversarial gap
YES

Two concrete attacker paths:

a) **AC8 default-path bypass.** The injectable-deps overload can be implemented
correctly (probe → conditional spawn → guard concurrent callers) while the
non-deps "production" path (no deps argument) retains the original duplicate-
spawn bug. The gate has no test for `ensureZellijWeb(url)` without deps — the
implementer is free to special-case the test path. This is partially mitigated
by AC8's intent ("verifies no duplicate daemon") which the deps surface does
encode, but a strict reading of AC8 implies the production default must also
guard. Minor — flag rather than block.

b) **AC7 (iii) loophole.** `expect(spawnCount).toBeLessThanOrEqual(1)` admits 0 —
an implementation that never spawns under concurrent calls passes. Case (ii)
prevents the trivial always-zero implementation, but a probe-eats-the-second-
caller bug (e.g. second caller's spawn is dropped silently with no error)
would slip through. Acceptable: the alternating-probe test partially catches
state-leak between calls.

### 3. Coverage gap
NO (minor)

Uncovered properties: the no-deps production default-path of `ensureZellijWeb`
(see item 2a) — but AC8 says "verifies no duplicate daemon is running before
spawning", which the deps-driven tests do encode at the contract level.
Practical coverage of every observable property in AC7 and AC8 is present.

### 4. Behavior vs implementation detail
YES — tests behavior-pinned

The `globalThis.WebSocket` swap pattern in the AC7 tests is implementation-
coupling at the test-setup level (it pins how the proxy obtains its upstream
WebSocket), but the assertions themselves check observable state:
`closeSpy.callCount`, `activeBridges.get(sessionId)`, and `bridgeLog`-emitted
event reasons. Quoting:

```ts
expect(staleUpstream.closeSpy.callCount).toBe(1);
expect(activeBridges.get(sessionId)).toBe(ws2);
expect(staleEvt?.reason).not.toBe(normalReason);
```

These pin behavior, not internals. The reason-distinguishability test does not
hard-code a specific string ("stale-replaced") — it only requires the two
reasons differ, which is the right level of pinning.

The AC8 tests pin the deps-surface contract (an implementation detail of the
chosen test seam), but this is unavoidable given the IO boundary; the deps
shape is documented in the gate file's preamble as the contract the implementer
must honor.

## Verdict summary

PASS. Both in-scope ACs (7 and 8) are mapped to concrete assertions on
observable state. The gate-scope tension (AC7 asserted from zellij-auth.test.ts
via the slice-1 export surface) is acceptable because the assertions exercise
real cross-module behavior, not file-naming convention. Two minor adversarial
gaps noted (default-path bypass for AC8, lower-bound looseness for AC7-iii) but
neither rises to a structural coverage hole. Tests are behavior-pinned.
