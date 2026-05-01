# Tester review — 013-migrate-sessions-to-route-kit

Attempt 1 of 3

## Rubric

### 1. Does every acceptance criterion in proposal.md map to at least one test?

**YES** - with qualifications:

- AC #1 ("sessions.routes.ts uses route() + mountPair()") → integration test "implementation uses route-kit pattern"
- AC #2 ("sessions.routes.test.ts passes unchanged") → the 6 existing unit tests in that file
- AC #3 ("integration test validates mountPair built both halves") → integration tests "mountPair builds both app and testApp instances" + "app serves /api/sessions with live deps"
- AC #4 and #5 are build-system/process checks, not implementation checks — acceptable to defer to Step 6 validation

### 2. Name one concrete way the implementation could pass all tests while violating intent.

**YES** - gap identified:

The integration test checks for string presence in source code (`toContain("mountPair")`, `toContain('from "../../platform/route-kit.ts"')`, `not.toContain("defineRoute")`). An implementation could satisfy these checks by:

1. Adding `// TODO: migrate to mountPair` in a comment
2. Adding a dead import `import { route, mountPair } from "../../platform/route-kit.ts"` that's never used
3. Renaming `defineRoute` to `defineRouteOld` or using an aliased import

The actual wiring could remain unchanged (parallel `app` and `testApp` Hono chains with the old pattern), passing all string checks while violating the migration intent. The unit tests would likely catch this eventually (if the wiring broke), but the integration test specifically claims to validate the migration happened, yet it only checks strings, not semantic usage.

### 3. List any testable property in the intent that no test covers (coverage gap).

**YES** - multiple gaps:

1. That `route()` is actually CALLED (not just imported) — 5 times, once per handler
2. That `const deps = { live: ..., test: ... }` structure exists (new pattern) rather than `makeDeps()` + `testDeps` as separate variables (old pattern)
3. That `mountPair((a, h) => a.post(...).get(...).delete(...))` builder is actually invoked to build both apps, rather than parallel `new Hono()...` chains
4. That the 5 routes are registered through `r.open[h]`, `r.def[h]`, etc. (indexing into a RoutePair), not through `defineRoute({ deps, handler })`

The current test only verifies the migration happened by grepping for strings. It doesn't verify the new semantic structure exists.

### 4. Are the tests pinned to observable behavior, or do they encode implementation detail?

**NO** - implementation detail coupling:

The integration test explicitly reads the source file with `readFileSync("apps/backend/src/features/sessions/sessions.routes.ts", "utf8")` and asserts on string contents:
- `expect(source).toContain("mountPair")` couples to the exact function name
- `expect(source).toContain('from "../../platform/route-kit.ts"')` couples to the exact import path
- `expect(source).not.toContain("defineRoute")` would break if a comment or docstring mentioned `defineRoute`

For a structural migration where behavior is preserved, some degree of structural checking is inherent to the spec's intent ("uses route() + mountPair() instead of defineRoute" IS an implementation-detail requirement). However, checking raw string presence is brittle — it doesn't distinguish between semantic usage and coincidental string matches.

## Verdict

**FAIL**

### Failed items

**Item 2** (adversarial check): The string-matching approach allows an implementation to pass by adding the required strings in comments or dead code without actually using the new pattern.

**Item 3** (coverage gaps): The test doesn't verify that `route()` is called, that `deps` uses the new structure, or that `mountPair` is actually invoked. It only checks that these strings appear somewhere in the source.

**Item 4** (implementation coupling): Source code string matching is inherently coupled to implementation detail. While the spec's intent IS structural (verify the new pattern is used), the current checks are too shallow — they verify string presence, not structural correctness.

### Expected correction

The integration test should verify the semantic structure of the migration, not just string presence. The gap is: how do you test that the new pattern is used without tightly coupling to implementation details?

For a structural migration, the test must inspect structure. But instead of raw string matching, consider:
- Importing the expected shapes (`RoutePair`, `ServicePair`) and asserting the file exports values of those types
- Checking that calling `sessionsRoute.app` and `sessionsRoute.testApp` produces the expected behavior differences (e.g., live vs test layers)
- Verifying that the implementation produces the same routes but with different internal structure

The current test conflates "the file contains these strings" with "the migration happened correctly." Tighten the semantic check or accept that for a structural migration, some implementation coupling is unavoidable and the real validation is typecheck + existing unit tests.
