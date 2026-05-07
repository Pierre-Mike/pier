# Tester review — 022 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC 1 (filteredProjects excludes session-bearing) → test "filteredProjects EXCLUDES projects that have an active session" (line 149) — uses live import + populated `store.sessions`, asserts `not.toContain("proj-with-session")` ✓
  - AC 2 (filteredProjects still returns no-session) → test "filteredProjects still includes projects without a session" (line 157) ✓ + projectFilter regression at line 163 ✓
  - AC 3 (renderProjects body has no `sessions.has(...).add("open")`) → test "renderProjects body does NOT add 'open' class conditional on session membership" (line 175) ✓
  - AC 4 (spec 020/021 tests remain green) → preserved blocks: GitHub ctx menu (line 57), renderSessions split (line 185), openSessionContextMenu (line 207), renderProjects ctx menu (line 246), user-select (line 254) ✓

### 2. Adversarial gap
YES
The AC 3 regex `sessions\.has\s*\([^)]+\)[^;]*\.add\s*\(\s*["']open["']\s*\)` requires `.has(...)` and `.add("open")` to share a statement (no `;` between). An implementer could split into two statements — `const isOpen = store.sessions.has(p.id); if (isOpen) li.classList.add("open");` — and bypass the regex while keeping the dead `add("open")` call. However, since AC 1 excludes session-bearing projects from the list rendered by `renderProjects`, the `<li>` would never exist for the implementer to mutate, making this a cosmetic-not-structural gap. Acceptable.

### 3. Coverage gap
NO
All four ACs have direct test coverage. The single-list invariant ("no project appears in both lists simultaneously") is enforced transitively: AC 1's behavioral test ensures bottom list excludes session-bearing projects; the renderSessions block (preserved from spec 021) ensures top list includes them. No additional testable property is identified in the intent that lacks coverage.

### 4. Behavior vs implementation detail
YES
AC 1/2/3 split cleanly:
  - AC 1, 2: live imports of `filteredProjects` and `store` from `./projects.ts` and `./state.ts` — pure behavioral.
  - AC 3: source-text regex on `renderProjectsBody`, but this mirrors the proposal AC ("renderProjects body does NOT contain a `sessions.has(...).add("open")` pattern") so the source coupling is intentional and proposal-anchored, not test-author overreach.
  - Preserved spec-020/021 blocks remain source-text-coupled (extractor + substring), unchanged from prior frozen gates.

## Internal contradiction check (spec-022-specific)

PASSED. Searched for assertions pinning the OLD spec-021 behavior (filteredProjects INCLUDING session-bearing projects). All three references to `proj-with-session` are `.not.toContain` (lines 154, 168). No leftover assertion contradicts the spec-022 reversal.

## Verdict summary
PASS. Every AC maps to at least one test, the adversarial gap identified is neutralized by AC 1's exclusion guarantee, no coverage gap remains, and tests are appropriately split between behavioral (filteredProjects) and source-text (regex on renderProjects body, which the proposal explicitly authorizes). No internal spec-021/022 contradiction. Gate frozen; spec-implementer may proceed.
