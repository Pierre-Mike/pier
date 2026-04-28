# Tester review — 007-drop-injects-terminal-path (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC 1 (`.pier/drops/` not `.drops/`) → unit `saved path contains .pier/drops/ not .drops/` + smoke inline repo check ✓
- AC 2 (response includes `injected` boolean) → unit `response shape includes injected boolean field` ✓
- AC 3 (writeChars called with shell-quoted, space-joined, trailing-space) → unit `writeChars … single file with space`, `… single safe path`, `… two files, second has space` ✓
- AC 4 (writeChars=false → 200 with injected:false) → unit `writeChars returning injected: false` via `falseApp` ✓
- AC 5 (frontend `Inserted into terminal:` toast on injected:true) → frontend `success branch emits 'Inserted into terminal:' toast` + `Inserted into terminal toast fires without a clipboard.writeText call on the same branch` ✓
- AC 6 (frontend failure toast + clipboard on injected:false; no clipboard on success) → frontend `failure branch emits …`, `copyToClipboard … is NOT called unconditionally on success`, `clipboard write IS called on the injected: false path` ✓

### 2. Adversarial gap
YES (acknowledged, not blocking)

The frontend gate uses source-text greps rather than DOM-level assertions. An implementer could in principle satisfy the substring checks by embedding the AC strings in comments or in the failure-only branch and still ship a broken success branch. This risk is partially mitigated by `Inserted into terminal toast fires without a clipboard.writeText call on the same branch`, which inspects a 400-char window around the success-toast string, and by `clipboard write IS called on the injected: false path`, which forces an `injected … clipboard` proximity match. Net: residual gap is narrow (literal-string smuggling) and is structural to the no-DOM gate shape, not a tester miss.

### 3. Coverage gap
NO (none)

All testable properties from the proposal are covered:
- multi-file space-join (two-file test, regex `^…+ '…' $`)
- literal trailing space (`text.at(-1) === " "` on all three writeChars tests)
- single-quote when path contains shell-special chars (file with space → `^'[^']+' $`)
- unquoted when path matches safe-char set (`safe.txt` → `^[A-Za-z0-9_\-./~]+ $`)
- frontend clipboard-touch contract on both branches (item-1 mapping)
- frontend toast-text contract (exact strings asserted)

### 4. Behavior vs implementation detail
YES, with minor concerns (cosmetic, not structural)

Concerns:
- `dropSource.match(/if\s*\(!r\.ok\)[\s\S]*?\{[\s\S]*?\}([\s\S]+)/)?.[1]` couples to the variable name `r` and the `!r.ok` negation pattern. An implementer using `if (response.ok) { … } else { … }` would not match this regex; the assertion would still hold (vacuously) because the captured region would be empty. The downstream `.not.toMatch(...)` then trivially passes — soft, but not catastrophic.
- The safe-char regex `^[A-Za-z0-9_\-./~]+ $` is restrictive but the proposal does not specify the exact safe-char set; if the implementer's quote rule omits `~` from the unquoted set, an absolute home-relative path could be unexpectedly quoted. Acceptable: the tester only tests `safe.txt`, which has no `~`.
- Smoke gate no longer imports `shellQuote` by name; observable-behavior pivot confirmed (line 13 comment + removal of named import).

Net: tests are predominantly behavior-pinned (HTTP shape, response JSON, writeChars text content). Source-greps in the frontend gate are an acknowledged compromise for AC 5/6 coverage without a DOM harness.

## Verdict summary

PASS. Attempt-1 blockers are resolved:

1. Frontend gate `drop.test.ts` now exists and asserts both AC-5 and AC-6 strings plus the no-clipboard-on-success contract on two independent regions.
2. The writeChars-capture seam is sound: `capturedDeps = Layer.merge(testDeps, TerminalSessionsWithWriteChars)` is provided to a Hono app wired via `defineRoute({ deps: capturedDeps, handler: importedDropHandler })`. The `expect(capturedApp).not.toBeNull()` precondition REDs cleanly until `dropHandler` is exported, and turns GREEN once the implementer exports the handler and wires writeChars.
3. Text-content assertions pin the contract: `^'[^']+' $` (quoted), `^[A-Za-z0-9_\-./~]+ $` (unquoted), `^[A-Za-z0-9_\-./~]+ '[^']+' $` (mixed two-file), with explicit `.at(-1) === " "` literal-space checks on all three.
4. Smoke gate dropped the `shellQuote` named-export coupling and now verifies via the inline repo path check + the structural `Pick<TerminalSessions, "writeChars">` compile-time RED.
5. `falseApp` is independently wired with a stub returning `{ injected: false }`, decoupled from default-layer behavior.

Minor item-4 concerns (regex coupling to `r.ok` variable name) are cosmetic and do not block PASS. Gate freezes.
