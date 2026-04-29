# Tester review — 010-double-shift-palette (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC1 (≤300ms opens) → `palette.test.ts` "AC1 — double-shift opens palette" (200ms + exact 300ms boundary inclusive) + smoke check #2
- AC2 (>300ms no open) → "AC2 — taps too far apart do not open" (301ms) + smoke check #3 (400ms)
- AC3 (intervening non-Shift resets) → "AC3 — intervening non-Shift resets"
- AC4 (modifier-laden Shift ignored) → "AC4 — modifier-laden Shift ignored" (ctrl, meta, alt — three tests)
- AC5 (toggle closes) → "AC5 — toggle closes when already open"
- AC6 (postMessage relay = native) → "AC6 — postMessage relay exercises real listener wiring" (relay-only via real MessageEvent dispatch on a swappable EventTarget; native+relay mix; wrong-type rejection) + smoke checks #4, #5
- AC7 (Enter project → close, then selectProject) → "AC7 — project row dispatch order" + "AC7 — project row close-before-selectProject (call order array)" + smoke check #6
- AC8 (Enter file → close, then openViewer) → "AC8 — file row dispatch order" (incl. activeProjectId assertion) + smoke check #7
- AC9 (Esc closes) → "AC9 — Esc closes" (open and idempotent-when-closed)
- AC10 (fuzzy substring ranking) → "AC10 — fuzzy filter via getEntries" (ranking, empty query, no-match) + smoke check #9

Bonus: "entry ordering — projects before files" (constraint satisfied independently of fuzzy filter) + smoke check #8.

### 2. Adversarial gap
NO — searched, found none material.

Considered:
- Implementer ignoring timestamps: blocked by AC2 (301ms must not open) and smoke #3 (400ms must not open).
- Implementer satisfying AC10 via plain alphabetical sort: project fixture ("foo-project" vs "zzz-unrelated") would coincidentally match alphabetical order, but file fixture "bar/index.ts" vs "src/foo.ts" makes alphabetical-only ranking fail (bar comes before src/foo for query "foo"). The combined ordering is satisfiable only by substring-ranking, not alphabetical alone.
- Implementer accepting any postMessage payload type: AC6 wrong-type test rejects this.
- Implementer leaving palette open and calling selectProject anyway: AC7 / AC8 close-before-dispatch verified by sampling `isOpen()` synchronously inside the dispatched callback (forces close to have fired before the callback invocation).
- Implementer skipping the actual `addEventListener("message", ...)` wiring: AC6 dispatches real `MessageEvent` on a constructor-injected `relayTarget`, which only opens the palette if the implementer registered a real listener.
- AC1 boundary (exactly 300ms inclusive) explicitly asserted; satisfies "≤300ms".

Outside-click close (mentioned in Intent prose, not in AC checklist) remains uncovered, but the proposal does not list it as a numbered AC. Within the AC scope the gate is sound.

### 3. Coverage gap
NO

All 10 numbered acceptance criteria have explicit assertions in both the unit gate and the smoke gate. The constraint "Mouse click on a row behaves identically to Enter" is abstracted into the single `selectRowAt` observable, so both code paths converge on the same assertion. Outside-click close is mentioned only in Intent prose, is not a numbered AC, and is not testable without a DOM — acceptable omission for a unit + smoke gate.

### 4. Behavior vs implementation detail
YES — tests behavior-pinned.

The gate now defines a single contract surface (`installPalette(deps) → PaletteHandle`) with named methods that correspond to user-observable events (`tap`, `nonShiftKey`, `esc`, `selectRowAt`, `getEntries`, `isOpen`, `dispose`). The contract is declared explicitly in the gate file's header doc-comment, leaving the implementer free to factor internals (single keydown handler, multiple modules, state machine, or anything else). The one legitimate coupling — the `relayTarget` injection point and `addEventListener("message", ...)` requirement — is mandated by the proposal ("postMessage relay") and verified through the observable side-effect (palette opens) rather than by spying on the listener registration directly. Previous attempt's specific method-name imports (`createPaletteStateMachine`, `applyFuzzyFilter`, etc.) are gone.

## Verdict summary

PASS. The revised gate fixes attempt 1's three failures: AC6 now exercises real `MessageEvent` dispatch on a swappable `relayTarget` (an implementer who forgets to register the listener fails the test); AC7 dispatch ordering is verified symmetrically with AC8 by sampling `isOpen()` synchronously inside the callback; the implementation-coupling problem is resolved by collapsing the surface to one `installPalette` factory returning a behavioral handle, with the contract spelled out in the gate header. AC10 fixture is constructed so alphabetical-only sorting cannot pass. All 10 ACs map to explicit assertions in both unit and smoke gates. Ready for spec-implementer.
