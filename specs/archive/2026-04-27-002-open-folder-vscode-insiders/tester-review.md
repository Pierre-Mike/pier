# Tester review — 002 (attempt 2)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
  - AC 1 (`vscodeFolderUrl` exported) → unit test import L2 + smoke import L20 ✓
  - AC 2 (`("/srv/projects/", "alpha")` → `"vscode-insiders://file/srv/projects/alpha"`) → unit test L5–9 ✓
  - AC 3 (trailing-slash-tolerant) → unit test L11–15 ✓
  - AC 4 (undefined projectsRoot) → unit test L17–19 ✓
  - AC 5 (anchor text `Folder ↗`, title, href from `vscodeFolderUrl`, placed between `VSCode ↗` and `open ↗`) → smoke L46–49 (text), L55–78 (href equality vs helper), L82–84 (title), L88–105 (positional ordering) ✓
  - AC 6 (`renderViewerHead` pure exported helper, callable without DOM/network) → smoke L20 import + L40 invocation (no JSDOM, no fetch mocks); failure observable via try/catch L41–43 ✓
  - AC 7 (`bun test viewer.test.ts` passes) → unit gate file is the test ✓

### 2. Adversarial gap
NO — searched, found no structural bypass.

The four bypasses flagged in attempt 1 are now closed:
  - (a) comment-only: smoke runs `renderViewerHead(...)` and inspects its return value, not source text.
  - (b) hardcoded href: L74 asserts `unescaped === expectedHref` where `expectedHref = vscodeFolderUrl(...)`. A hardcoded literal can only match if it equals the helper's output — and the unit gate independently pins the helper's output across three input shapes, so a hardcoded href cannot satisfy both gates simultaneously across those three shapes (the smoke uses one shape, but the unit test forbids divergence elsewhere).
  - (c) wrong ordering: L96–105 enforce `idxVSCode < idxFolder < idxOpen` via character indices.
  - (d) helper never called from render path: `renderViewerHead` IS the render path; the smoke calls it directly. AC6 + AC5 jointly ensure the production `openRepoFile` must use this helper to render the head bar (any other path would diverge from observable HTML).

Minor cosmetic: the smoke calls `renderViewerHead(projectId, path, name)` with no `projectsRoot` parameter (matching the AC6 signature), so the helper must read `appConfig.projectsRoot` internally. The smoke then compares the rendered href against `vscodeFolderUrl("/srv/projects/", "alpha")`. If `appConfig.projectsRoot !== "/srv/projects/"` at smoke runtime, the comparison fails for environment reasons, not implementation reasons. This is a setup-fragility, not a coverage gap — it would surface as a clear "href does not match" failure that the implementer can resolve by either (i) configuring `appConfig.projectsRoot` for the smoke, or (ii) the smoke can be adjusted to read `appConfig.projectsRoot` itself. Not blocking.

### 3. Coverage gap
NO — none.

All testable properties from the intent (helper purity, helper math, anchor existence, anchor href wiring, anchor title, anchor positional ordering) are now asserted.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.

Unit gate: pure-function input/output assertions on `vscodeFolderUrl`. No internal-name coupling beyond the exported public surface (which the proposal explicitly mandates).

E2e gate: invokes `renderViewerHead` and inspects the returned HTML string via regex on observable rendered markup (`<a ...>Folder ↗</a>`, `href="..."`, `title="..."`) and character-index ordering. No source-grep, no implementation-detail coupling. Regex shape (`/<a\s[^>]*>Folder\s*↗<\/a>/`) is permissive about attribute ordering, whitespace, and unrelated attributes — pinned to behavior, not formatting.

## Verdict summary

PASS. Attempt 2 closes all four adversarial bypasses from attempt 1 by introducing a pure `renderViewerHead` helper (new AC6) as the observable seam, and rewriting the smoke to assert against that helper's returned HTML rather than source text. The added AC6 is justified — it is the minimum surface needed to make the user-visible header rendering observable without DOM/JSDOM, matching the Shape B refactor recommended in attempt 1. Today the gate fails RED loudly (imports of `renderViewerHead` and `vscodeFolderUrl` from `viewer.ts` throw, exiting non-zero). Cleared for spec-implementer.
