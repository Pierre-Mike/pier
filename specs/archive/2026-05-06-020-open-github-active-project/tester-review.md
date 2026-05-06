# Tester review — 020-open-github-active-project (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
  - AC 1 (`renderSessions()` attaches `contextmenu` listener on each session `<li>`) → unit test "renderSessions attaches a contextmenu listener on each session li" + smoke assertion "renderSessions() attaches addEventListener(\"contextmenu\", …) on each session li" ✓
  - AC 2a (handler calls `ev.preventDefault()`) → unit test "renderSessions contextmenu handler calls ev.preventDefault()" + smoke assertion ✓
  - AC 2b (handler calls `openProjectContextMenu({id: pid, x: ev.clientX, y: ev.clientY})`) → unit tests "renderSessions contextmenu handler calls openProjectContextMenu", "renderSessions passes project id to openProjectContextMenu" (regex `\bid\s*:\s*pid\b`), "renderSessions passes clientX and clientY to openProjectContextMenu" + smoke assertions ✓
  - AC 3 (`openProjectContextMenu` fetches `/api/projects/:id/github-url`) → unit test "openProjectContextMenu fetches the github-url endpoint" + smoke assertion ✓
  - AC 4 (`window.open(url, "_blank", "noopener,noreferrer")` on success) → unit test "openProjectContextMenu calls window.open with _blank and noopener,noreferrer on success" + smoke assertion ✓
  - AC 5 (`toast("No GitHub remote for this project")` on null/404) → unit test "openProjectContextMenu toasts on missing GitHub remote" + smoke assertion ✓
  - AC 6 (`bun test apps/frontend/src/dashboard/projects.test.ts` passes) → meta-AC, satisfied by the test file's structure ✓

### 2. Adversarial gap
YES — searched, found minor gaps but nothing structural.

Possible bypass: an implementer could add `addEventListener("contextmenu", ...)` to a non-`<li>` element inside the `renderSessions` function body (e.g., a sibling header div) and the substring assertions would still pass. The regex `\bid\s*:\s*pid\b` does, however, require the loop variable name `pid`, which constrains the call to be inside the per-session loop in practice — preserving symmetry with `renderProjects()`.

A second potential bypass: the tests scope by extracting the function body via regex up to the next `export function|async function|const`. If an implementer adds the contextmenu wiring inside a helper closure declared before `renderSessions`, the regex still captures it (it's inside the body), so this is fine; but if `renderSessions` is later split into multiple non-exported helpers between exports, the regex extraction may include unrelated content. This is a minor brittleness, not a correctness gap.

The intent ("symmetric with `renderProjects()` lines 139–142") is narrow enough that these bypasses would require an implementer actively gaming the gate. Acceptable.

### 3. Coverage gap
NO — no testable property in the intent is uncovered.

All six ACs have at least one assertion. The constraint "Skip `__default__` row" is implicitly satisfied by the existing `renderSessions` filter (proposal explicitly notes "already filtered by the `renderSessions` loop"); not a new testable property introduced by this spec.

### 4. Behavior vs implementation detail
YES — tests are source-string assertions rather than behavioral DOM-event assertions, but this is justified for this spec.

The gate uses substring matches against `projects.ts` text (e.g., `expect(projectsSource).toContain('addEventListener("contextmenu"')`). This couples to source syntax: a refactor that uses `el.addEventListener('contextmenu', ...)` (single quotes) or `el.on('contextmenu', ...)` would fail despite preserving behavior. However:

  - The spec's Constraints section explicitly forbids refactoring (`Reuse openProjectContextMenu verbatim — no extraction or refactoring`) and pins the touched file to `projects.ts`.
  - The intent is symmetry with `renderProjects()` lines 139–142, which use the exact double-quoted `"contextmenu"` form. Asserting that exact form is appropriate.
  - A behavioral DOM test would require jsdom + simulated mouse events, which is out of scope for a constraint that says "wire one listener symmetric with the existing one."

The source-string approach is fit-for-purpose here. Quoted lines like `expect(projectsSource).toContain('addEventListener("contextmenu"')` are tight to the constitution's expected form.

## Verdict summary

PASS. All 6 ACs map to at least one unit test and one smoke assertion. The adversarial bypasses identified require deliberate gaming and are blocked in spirit by the proposal's "symmetric with `renderProjects()`" framing. The tests being source-text-based rather than DOM-behavioral is the right shape for a narrow "wire one listener" change with explicit no-refactor constraints. RED state is credible: the assertions target a `contextmenu` addEventListener inside `renderSessions` that the proposal states does not exist today.
