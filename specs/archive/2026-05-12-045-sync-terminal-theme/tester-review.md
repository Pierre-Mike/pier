# Tester review — 045 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage

YES

Mapping:
- AC 1 (terminal-theme.ts exists, exports syncTerminalTheme) → unit test: "terminal-theme.ts exports syncTerminalTheme function" ✓
- AC 1 (signature: theme param) → unit test: "syncTerminalTheme accepts a theme parameter typed as dark|light" ✓
- AC 2 (iterates iframes, applies theme) → unit tests: "targets terminal iframes (data-project selector or #terminals)" ✓ and "sends the theme to iframes (postMessage or URL param or data-theme)" ✓
- AC 3 (theme.ts calls syncTerminalTheme) → unit tests: "theme.ts imports syncTerminalTheme from terminal-theme" ✓ and "theme.ts calls syncTerminalTheme on theme change" ✓
- AC 4 (unit gate green) → self-referential gate
- AC 5 (e2e gate green) → e2e checks 1–4 covering file existence, export, wiring, design.md ✓
- AC 6 (design.md documents investigation) → e2e check 4: design.md must contain ## Implementation, ## Limitation, or ## Investigation section ✓

### 2. Adversarial gap

YES — searched, found one acceptable gap.

An implementer could pass all tests by calling `iframe.dataset.theme = theme` on each iframe (satisfying the `dataset.theme` relay check) without the terminal colors actually changing in the cross-origin zellij-web content. The test cannot verify the visual terminal outcome without a live zellij-web instance. This gap is by design: the spec explicitly states that if the platform prevents runtime theme changes, the implementer escalates via `blocker.md` rather than faking it. The tests encode structural intent (the module exists, the wiring exists); the "does it actually work" question is delegated to the implementer's investigation. This is an acceptable adversarial gap given the investigation-branch spec design.

### 3. Coverage gap

YES — one minor gap, acceptable.

AC 3 says `syncTerminalTheme` must be called "both on toggle and on `initTheme()`". The unit test checks `callCount >= 1` (not `>= 2`). An implementer could call it only in the toggle path and miss the `initTheme()` path while satisfying the test. However, given the source-text pattern, `>= 1` is a pragmatic simplification — the e2e check verifies `theme.ts` references `syncTerminalTheme` at all, and the intent in the spec's Constraints section ("after applying the UI theme, it calls `syncTerminalTheme`") is clear enough for the implementer. Not escalating on this.

### 4. Behavior vs implementation detail

YES — tests are behavior-pinned with appropriate flexibility.

The relay mechanism check uses OR of multiple valid patterns (`postMessage`, `?theme=`, `dataset.theme`, `searchParams`, `URLSearchParams`) rather than a single hard-coded mechanism. The export check uses a regex `/export\s+(function|const)\s+syncTerminalTheme/` that accepts both `function` and `const` declaration styles. The iframe targeting check accepts `data-project`, `#terminals`, or `HTMLIFrameElement` — covering all reasonable implementation approaches. No library-specific error strings or internal function names are hard-coded.

## Verdict summary

PASS. All six acceptance criteria map to at least one test. The adversarial gap (structural vs visual testing) is inherent to cross-origin iframe testing and is explicitly addressed in the spec's escalation design. The minor call-count gap on AC 3 is acceptable given the implementation guidance in Constraints. Tests are behavior-pinned and flexible to implementation choice.
