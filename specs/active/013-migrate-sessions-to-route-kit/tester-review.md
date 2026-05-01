# Tester review — 013-migrate-sessions-to-route-kit

Attempt 2 of 3

## Rubric

### 1. Does every acceptance criterion in proposal.md map to at least one test?

**YES**

- AC #1 ("sessions.routes.ts uses route() + mountPair()") → integration test "implementation uses route-kit pattern structurally" checks:
  - route-kit imports exist (regex match on import statements)
  - `route({` is called (semantic usage)
  - `mountPair((a, h) =>` is called (builder pattern)
  - `deps = { live, test }` structure exists
  - Old patterns removed (`defineRoute`, `makeDeps`, `testDeps`, `new Hono` assignments)
- AC #2 ("sessions.routes.test.ts passes unchanged") → 6 existing unit tests in that file
- AC #3 ("integration test validates mountPair built both halves") → integration tests:
  - "mountPair builds both app and testApp instances"
  - "both halves serve /api/sessions correctly"
- AC #4 and #5 are build-system checks (turbo, tasks:verify) — deferred to Step 6

### 2. Name one concrete way the implementation could pass all tests while violating intent.

**NO** - searched, found no exploitable gap.

The tightened regex checks verify:
- Actual import statements (not comments): `/import\s+{[^}]*route[^}]*}\s+from.../`
- Semantic call patterns: `/route\(\{/`, `/mountPair\(\s*\(\s*a\s*,\s*h\s*\)\s*=>/`
- Structural elements: `/const\s+deps\s*=\s*{\s*live:/`
- Negative assertions: `not.toMatch(/const\s+app\s*=\s*new\s+Hono/)`

An attacker could theoretically add dead code with these patterns alongside the old wiring, BUT:
1. The negative assertions would fail if the old `const app = new Hono` pattern exists
2. Removing the old pattern breaks the old wiring
3. The unit tests import `sessionsRoute` and validate behavior, so exporting the wrong shape would fail

I cannot construct a plausible attack that satisfies all positive checks, passes all negative checks, AND passes the 6 behavioral unit tests while violating the migration intent.

### 3. List any testable property in the intent that no test covers (coverage gap).

**NO** - no gaps identified.

The structural checks verify:
- route-kit imports (semantic)
- `route()` called
- `mountPair()` called with builder
- `deps = { live, test }` structure
- Old patterns removed

The behavioral checks (unit + integration) verify:
- 5 routes work (unit tests exercise all routes)
- Both `app` and `testApp` are Hono instances
- Both halves serve requests correctly

Requiring the test to check "5 `route()` calls" would be over-specification — the unit tests already validate all 5 routes work. The integration test verifies the wiring pattern exists; the unit tests verify the result.

### 4. Are the tests pinned to observable behavior, or do they encode implementation detail?

**YES** - with qualification.

The integration test uses regex matching on source code, which couples to file structure and naming. However:

1. **For a structural migration spec, structural checking is appropriate.** AC #1 explicitly requires "uses route() + mountPair() instead of defineRoute" — this IS a structural requirement, not a behavioral one.

2. **The regex patterns check semantic structure, not arbitrary strings.** The patterns match import statements, function call sites, and variable declarations — semantic code elements, not just substring presence.

3. **The coupling is scoped to the spec's intent.** The test checks the exact patterns the spec requires (route-kit usage) and the exact patterns the spec forbids (defineRoute, parallel chains).

4. **Behavioral tests coexist.** The unit tests (unchanged) and behavioral integration tests ("both halves serve /api/sessions correctly") validate the contract. The structural test validates the migration.

For a migration spec where the behavior is preserved and the intent is "change the wiring pattern," checking the wiring pattern is pinning to the right level of observable property.

## Verdict

**PASS**

The revised integration test addresses all rubric concerns:
- Item 1: All implementation ACs map to tests
- Item 2: No exploitable gap (semantic checks + negative assertions + behavioral validation)
- Item 3: No coverage gaps
- Item 4: Structural coupling appropriate for structural migration spec

The test verifies the migration happened by checking semantic code patterns, not just string presence. The combination of structural checks (migration happened) + behavioral checks (routes still work) provides sufficient coverage for a wiring-pattern migration.
