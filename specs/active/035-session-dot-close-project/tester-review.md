# Tester review — 035 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC 1 → unit: "renderSessions body contains session-alive-dot class reference" + integration: "renderSessions renders a .session-alive-dot element in each session li" ✓
  - AC 2 → unit: "renderSessions body gates session-alive-dot on sessionId presence" + integration: "renderSessions does NOT render .session-alive-dot when session has no sessionId" ✓
  - AC 3 → unit: "renderProjects body does NOT contain session-alive-dot" + integration: "session-alive-dot elements are confined to the sessions list, not the projects list" ✓
  - AC 4 → unit: "renderSessions uses the literal class name 'session-alive-dot' in a DOM construction context" ✓
  - AC 5 → unit: "dismissSession body still does NOT call api.api.sessions delete endpoint (spec 034 regression)" ✓

### 2. Adversarial gap
NO — searched, found none worth blocking on.

The most plausible adversarial path: add `session-alive-dot` unconditionally in the template string while placing a comment `// sessionId` within 400 chars to satisfy the proximity check in the AC 2 unit test. However, the integration test "renderSessions does NOT render .session-alive-dot when session has no sessionId" is a direct behavioral assertion that queries the DOM with a session entry that has no `sessionId`. An unconditional dot would make this integration test fail. The two-layer coverage (source proximity + DOM behavior) closes this gap adequately.

### 3. Coverage gap
NO — none found.

One marginal gap: no test asserts the dot is not hidden via CSS `display:none` or `visibility:hidden` (the constraint in proposal.md says "not hidden purely by CSS"). This is non-testable at the unit/integration level without a CSS-capable rendering engine. The class-presence DOM assertion is the correct proxy; enforcing style rendering is out of scope for this gate level.

### 4. Behavior vs implementation detail
YES — tests are appropriately behavior-pinned given the codebase's established pattern.

The unit tests use `extractFunctionBody` to read source text — this is an implementation-detail coupling, but it is the established pattern used across all prior specs (020–034) in this codebase. The integration tests use DOM queries (`.querySelectorAll(".session-alive-dot")`) which are behavior-pinned. The combination is consistent with the codebase's testing conventions and does not introduce new technical debt.

No specific test code is flagged as problematic. The 400-char proximity check in AC 2 is slightly fragile (could be gamed by comments) but is backed by the integration test.

## Verdict summary
PASS. All 5 acceptance criteria are covered by at least one test each. The integration tests provide behavioral grounding that prevents source-text-only gaming. No structural coverage gaps or implementation-detail couplings beyond the established codebase convention.
