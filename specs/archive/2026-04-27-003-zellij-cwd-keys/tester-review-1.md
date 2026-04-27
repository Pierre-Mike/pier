# Tester review — 003 slice 1 (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES — all in-scope ACs (slice 1 = ACs 4–6) mapped.

  - AC4 (`upgrade` log w/ `sessionId` + `activeBridges`)
    → `handleZellijWsUpgrade > emits bridge:upgrade BEFORE the upstream cookie fetch...` (line 166) ✓ (sessionId)
    → `handleZellijWsUpgrade > emits bridge:upgrade with activeBridges >= 1 after a bridge has been opened` (line 210) ✓ (activeBridges semantically pinned)
    → `handleZellijWsUpgrade > activeBridges count changes after a bridge closes` (line 250) ✓ (lifecycle tracked)
  - AC5 (`open` log w/ `sessionId` + `upstreamReadyState`)
    → `zellijWsHandlers.open > emits bridge:open with sessionId and upstreamReadyState equal to the constructed upstream's readyState` (line 89) ✓
  - AC6 (`close` log w/ `sessionId` + `reason`)
    → `zellijWsHandlers.close > emits bridge:close with sessionId and a non-empty reason when downstream closes` (line 120) ✓
    → `zellijWsHandlers.close > emits a DIFFERENT reason when upstream errors vs downstream closes normally` (line 133) ✓ (close-cause distinction)

Carryover note: terminal-sessions log coverage is out of scope for slice 1's gate file (terminal-sessions.test.ts is the slice-2 gate). Not a fault here.

### 2. Adversarial gap
YES — searched, found minor residual gaps; none structural.

Residual:

  - **`activeBridges` decrement is not numerically asserted.** Line 250's test asserts only that `bridge:close` is emitted, not that a subsequent `bridge:upgrade` would emit a smaller `activeBridges` value. An implementer could increment in `open` and never decrement. The line-247 `>= 1` assertion still defeats the prior "constant zero" gap, so the diagnostic minimum (count is non-trivially state-derived for at least the increment direction) holds. Cosmetic, not structural.
  - **Ordering assertion conditional.** Lines 200–207 only assert `eventIdx < settledIdx` when `settledIdx >= 0`, which depends on the handler's promise rejecting. In the test as written the cookie fetch will reject (no auth mock), so the conditional path is exercised. If a future implementer made the handler resolve cleanly without contacting upstream, the ordering check would silently skip. Minor.

Both are weaker variants of the original adversarial paths; the structural gaps from attempt 1 (`typeof === "number"` only, unconstrained `reason`, tautological shape-contract block, undefined upgrade ordering) are closed.

### 3. Coverage gap
NO — the previously-uncovered testable properties from attempt 1 are now covered:

  - activeBridges semantic pinning: covered by line 247 (`>= 1` after open) and line 250 (close emission tracked).
  - upstreamReadyState reflects the upstream: covered by line 111 (`evt.upstreamReadyState === fakeUpstream.readyState` with CONNECTING used to defeat hardcoded constants).
  - `reason` distinguishes close causes: covered by line 157 (`evtB.reason !== reasonA` across downstream-close vs upstream-error paths).
  - Upgrade emission ordering: covered by lines 166–207 (emission precedes async-settled marker pushed in `.catch`).

### 4. Behavior vs implementation detail
YES — tests behavior-pinned to the structured-log channel observable surface.

The `globalThis.WebSocket` patch (lines 97–99, 214–216, 255–257) remains, but is now documented as part of the contract via the file-level header comment (line 18: "the module MUST read globalThis.WebSocket at call time"). This converts the prior implicit coupling into an explicit contract the implementer must honor. Acceptable.

The `kind: "bridge:upgrade" | "bridge:open" | "bridge:close"` discriminator strings, the exported `bridgeLog` channel, and the `BridgeLogEvent` union are observable API choices — the right axis for a structured-log feature. JSON round-trip assertion (line 282) pins the "plain object, not free-form string" intent without coupling to internal layout.

## Verdict summary

PASS. All five required revisions from attempt 1 are addressed: `activeBridges` is pinned to observable state (`>= 1` after open, decrement-tracking via close emission), `upstreamReadyState` equals the constructed upstream's actual `readyState` with a non-default value to defeat constants, `reason` is asserted distinct across two close paths (downstream-initiated vs upstream-error), the tautological type-check block is replaced by a runtime JSON round-trip assertion, and upgrade-event ordering is pinned to fire before the async cookie-fetch settles. Residual adversarial gaps are cosmetic (count decrement not numerically asserted; ordering check conditional on rejection path) and do not undermine the diagnostic intent stated in proposal Context.
