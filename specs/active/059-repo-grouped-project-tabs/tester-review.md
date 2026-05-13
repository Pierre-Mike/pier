# Tester review — 059 (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage

NO

Mapping:
  - AC 1 (renderProjects groups by parent dir) → unit: "proj-group-header", "derives parent directory", "groups items by Map"; integration: "renders group header elements", "renders exactly two group headers", "same parent dir produces one header" ✓
  - AC 2 (two tabs "Projects"/"Active Agents", clicking hides other) → unit: label strings + tab-wire function name + hidden class existence. DOM click behavior NOT tested. Integration: no DOM test for clicking a tab. **PARTIAL** — source-level only; click-to-hide behavior uncovered.
  - AC 3 (Projects tab active → agent-view hidden) → **NO TEST**. No unit or integration test verifies that the agent-view container gets a `hidden` class when "Projects" tab is selected.
  - AC 4 (Active Agents tab active → agent-view visible in sidebar) → **NO TEST**. Completely uncovered.
  - AC 5 (filter works in grouped rendering) → integration: "filter 'alpha' shows only alpha row", "filter 'service' shows alpha and beta" ✓
  - AC 6 (session-alive-dot preserved) → integration: "still shows session-alive-dot on alive project row", "does not show on dead project row" ✓
  - AC 7 (count badge) → unit: "references agent count", "contains 'Active Agents' near a count" — weak source-level only ✓ (acceptable for badge)

### 2. Adversarial gap

YES — gap found.

An implementer can add the literal string `"Active Agents"` anywhere in projects.ts (e.g., in a constant, comment, or dead-code branch) and satisfy AC 2's source-level tests without wiring any tab switcher. The `hasToggle` test checks for `classList.add` / `classList.remove` / `classList.toggle`, but these methods already exist in projects.ts for other purposes (the existing `active`, `has-events`, `highlighted` class mutations). An implementer who does not add any tab-switching code at all could pass all existing AC 2 tests by adding a single comment-free string literal and pointing to existing classList calls.

More critically: AC 3 and AC 4 are fully unguarded — any implementation (including a no-op) would pass them because there are no tests.

### 3. Coverage gap

YES

Uncovered testable properties:
1. **AC 3 — Projects tab shows projects, hides agent-view**: No test asserts that when the "Projects" tab button is clicked (or when it is the active tab), the agent-view panel receives `hidden` class or equivalent. This is deterministically testable: add the tab markup to the DOM, call the tab-switcher, assert panel visibility.
2. **AC 4 — Active Agents tab hides projects, shows agent-view**: Same gap on the other side. No test asserts that clicking "Active Agents" hides the projects panel and shows the agents panel.
3. **AC 2 — exactly two tabs**: The "exactly two" constraint is not tested. A third tab could be added without failing any test. This is testable by querying tab buttons and asserting `querySelectorAll(".sidebar-tab").length === 2` or equivalent.
4. **AC 2 — click behavior (DOM)**: The tab switch click-to-hide is not tested in any DOM environment. The source-level tests only confirm code strings exist; they cannot verify that clicking tab A actually hides panel B.

### 4. Behavior vs implementation detail

UNCLEAR — the unit gate tests are source-text substring searches. This is an established pattern in this codebase (specs 021–037 use the same approach), so it is acceptable. However, the AC 2 source tests (`hasToggle` matching any `classList.add`) are over-broad and could pass even if the tab-wiring code does not exist (because the existing project rows already use classList). This is an adversarial gap (item 2), not just a coupling issue.

## Verdict summary

FAIL. AC 3 and AC 4 have zero test coverage — they describe observable tab-panel visibility behavior that is fully testable in a happy-dom DOM environment (the integration test file already uses happy-dom). Additionally, AC 2's click-to-hide behavior is not tested in DOM. The tester must add integration-level DOM tests for: (a) clicking "Projects" tab hides agent-view panel and shows projects panel, (b) clicking "Active Agents" tab hides projects panel and shows agent-view panel, and (c) exactly two tab buttons exist.

## Expected corrections for the tester

Item 1 — AC 3 and AC 4 must have explicit DOM tests:
- Set up DOM with: two tab buttons (`.sidebar-tab`, one `data-tab="projects"` and one `data-tab="agents"`), a projects panel (`#sidebar-tab-projects`), and an agents panel (`#sidebar-tab-agents`).
- Call the tab-wiring function.
- Simulate a click on the "Active Agents" tab button → assert `#sidebar-tab-projects` has `hidden` class AND `#sidebar-tab-agents` does NOT have `hidden` class.
- Simulate a click on the "Projects" tab button → assert the reverse.

Item 3 — AC 2 "exactly two tabs":
- In the same DOM setup, assert `document.querySelectorAll(".sidebar-tab").length === 2` (or whatever class the tester uses for tab buttons).

The source-level AC 2 tests in the unit gate are acceptable as-is; they just need the DOM tests added to the integration gate.

Do NOT write corrected test code — this is a rubric critique. The tester decides how to implement the corrections.
