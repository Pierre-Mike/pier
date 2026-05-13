# Tester review — 056 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage

YES

Mapping:
  - AC1 → `test("AC1: returns 3 rows grouped correctly from fixture daemon state")` + `test("AC1: each row has required AgentRow fields")` ✓
  - AC2 → `test("AC2: returns { id, shortId } when spawn outputs 'backgrounded · abcd1234'")` + `test("AC2: returns 409 when roster.json is absent")` + `test("AC2: returns 400 when prompt is missing")` ✓
  - AC3 → `test("AC3: decodeRoster accepts valid roster")` + `test("AC3: decodeRoster rejects roster missing 'workers' field")` + `test("AC3: decodeRoster rejects non-object roster")` + `test("AC3: decodeRoster rejects roster where workers is not a record")` ✓
  - AC4 → `test("AC4: returns 409 when roster.json is absent")` in GET /api/agents suite ✓
  - AC5 → full group-mapping suite in `agents.adapt.core.test.ts` (working/blocked/completed/failed/stopped/idle + field exposure) ✓
  - AC6 → `test("AC6: panel renders three section headings when agent view is mounted")` in e2e ✓
  - AC7 → `test("AC7: 'Attach' button is present on each agent row when rows are rendered")` in e2e ✓

### 2. Adversarial gap

NO (searched, found no structural gap)

Hypothetical: implementer could hard-code 3 rows in `makeAgentsTestApp` regardless of input. However, the tests assert specific `shortId` values (`"abcd0001"`, `"abcd0002"`, `"abcd0003"`) that must match the `stateByShortId` keys, and AC1's field validation test checks all required fields (name, needs, output, cwd, updatedAt, cliVersion) on each row — making naive hard-coding infeasible without reading the actual fixture state. The `makeAgentsTestApp` factory approach is the right integration-test pattern and does not open a meaningful self-collusion window.

### 3. Coverage gap

NO — none found

The `GET /api/agents/:id/peek` endpoint is in the aligned plan's HTTP surface but is NOT listed as an acceptance criterion in `proposal.md`. The gate explicitly focuses on: (a) grouped list, (b) dispatch shortId parse, (c) schema drift protection, (d) 409 when daemon absent, (e) group mapping, (f) frontend section headings, (g) frontend Attach button. All testable properties stated in the ACs are covered.

### 4. Behavior vs implementation detail

YES — tests are behavior-pinned

- `makeAgentsTestApp` is tested at the HTTP level (request/response) — not internal function calls.
- `decodeRoster` returning `{ _tag: "Right" | "Left" }` is the public API contract (Effect.Either encoding), not a library-internal detail; a different decode approach returning the same shape would still satisfy the tests.
- The e2e tests use `data-group-heading` and `data-agent-row` attributes — semantic HTML data attributes, not framework-specific selectors or CSS class names that would break on refactor.
- No library-specific error strings or version-dependent constants are asserted.

## Verdict summary

All 7 acceptance criteria are mapped to at least one test. No structural coverage gaps relative to the stated ACs. Tests are behavior-pinned with the `makeAgentsTestApp` integration factory pattern. Adversarial analysis found no viable exploit that satisfies the letter of the tests while violating their spirit. PASS.
