# Tester review — 037-session-dot-closed-rows (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC 1 (alive project row shows dot) → unit: "renderProjects body contains session-alive-dot" + integration: "renders .session-alive-dot on a project row when aliveSessions contains its ID" ✓
- AC 2 (dead project row does NOT show dot) → unit: "inside conditional expression" + integration: "does NOT render .session-alive-dot when aliveSessions does not contain its ID" ✓
- AC 3 (DashboardState has aliveSessions) → unit: "types.ts declares aliveSessions in DashboardState" ✓
- AC 4 (refreshProjects populates aliveSessions) → unit: "refreshProjects body references aliveSessions" + "fetches sessions from the backend" ✓
- AC 5 (renderProjects reads aliveSessions) → unit: "renderProjects body references aliveSessions from store" + "session-alive-dot is gated on aliveSessions (proximity check)" ✓
- AC 6 (dot not in sessions rows — auto via filteredProjects) → integration: "session-alive-dot from renderProjects appears only inside #projects, not #sessions" ✓

### 2. Adversarial gap
NO — searched, found none.

An implementer could try to add the dot unconditionally (always rendering it for every project). The unit test "inside conditional" checks for ternary/if near the dot. More importantly, the integration test "only the alive project row has the dot — dead project row has none" directly asserts exactly one dot when one of two projects is alive, which catches an unconditional implementation. The combination of source-text conditional check and DOM behavioral test closes this gap.

### 3. Coverage gap
NO

The `refreshProjects` → `aliveSessions` population path is tested via source-text (body must contain aliveSessions + sessions + api). These checks constrain the implementation sufficiently given that the integration tests directly test DOM behavior by manually setting `store.aliveSessions`. An end-to-end `refreshProjects()` behavioral test would add depth but is not required for the AC coverage to be complete.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.

- Integration tests assert DOM element presence (`.session-alive-dot` node exists or is null) — purely behavioral.
- Unit tests use source-text substring checks following the established codebase pattern (same `extractFunctionBody` approach as specs 021, 033, 034, 035 gates). The proximity check (400-char window) is slightly implementation-detail-adjacent but is a well-calibrated evasion guard matching the existing test style.

## Verdict summary

PASS. All 6 acceptance criteria are covered by at least one test. No adversarial gap was found — the integration test "only the alive project row has the dot" directly catches the most obvious evasion (unconditional dot). Coverage is sufficient: source-text checks enforce code structure while DOM behavioral tests enforce observable output. Tests follow the established behavior-pinned style of the codebase.
