# Tester review — 059 (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage

YES

Mapping:
  - AC 1 (renderProjects groups by parent dir) → unit: "proj-group-header" in body, "derives parent directory", "groups items by Map/groups/grouped/byDir/byRepo"; integration DOM: "renders group header elements with class proj-group-header", "renders exactly two group headers for two distinct parent dirs", "renders both proj-a1 and proj-a2 in same group", "single parent dir produces exactly one group header" ✓
  - AC 2 (two tabs labelled "Projects"/"Active Agents", click hides other) → unit: label strings in source, wireSidebarTabs function name, "hidden"+"sidebar-tab" proximity test; integration DOM: "sidebar contains exactly two tab buttons", "tab buttons labelled 'Projects' and 'Active Agents'" ✓
  - AC 3 (Projects tab active → projects visible, agent-view hidden) → integration DOM: "clicking Projects tab removes hidden from projects panel", "clicking Projects tab adds hidden to agents panel" ✓
  - AC 4 (Active Agents tab active → agent-view visible, projects hidden) → integration DOM: "clicking Active Agents tab adds hidden to projects panel", "clicking Active Agents tab removes hidden from agents panel", "clicking Active Agents tab marks that button as active and deactivates Projects button" ✓
  - AC 5 (filter works in grouped rendering) → integration DOM: "filter 'alpha' shows only alpha row", "filter 'service' shows alpha and beta but not gamma" ✓
  - AC 6 (session-alive-dot preserved) → integration DOM: "still shows session-alive-dot on alive project row in grouped layout", "does not show session-alive-dot on dead project row" ✓
  - AC 7 (badge count on Active Agents tab) → unit: "references agent count" (agentCount/agentRows/.length/badge), "contains 'Active Agents' near a count or length reference" ✓

### 2. Adversarial gap

NO — searched, found none.

The DOM tab-switching tests (AC 3 and AC 4) call `wireSidebarTabs()` on a fixture DOM and simulate real clicks, then assert class membership on `#sidebar-tab-projects` and `#sidebar-tab-agents`. An implementer must write working click handlers targeting these exact IDs to pass. The only theoretical bypass (comment with "sidebar-tab" near "hidden") does not affect the DOM tests, which are adversarially solid.

### 3. Coverage gap

NO — no uncovered testable properties from the AC list.

All seven ACs have at least one test. The negative constraint ("tab state is UI-only, no localStorage") is not in the AC list and is outside testable gate scope — acceptable.

### 4. Behavior vs implementation detail

YES — tests are behavior-pinned.

Unit gate uses source-text substring matching (established codebase pattern, consistent with specs 021–037). Integration gate uses DOM queries (class membership, element presence, click simulation) — entirely behavior-pinned. Interface contracts (element IDs, data attributes) are observable surface area the implementer must honor.

## Verdict summary

PASS. All seven acceptance criteria are covered. AC 3 and AC 4 now have explicit DOM click-simulation tests in the integration gate (revision 1 correction). The adversarial gap from attempt 1 (fake classList calls bypassing AC 2) is closed by the proximity constraint. Gate is ready for the implementer.
