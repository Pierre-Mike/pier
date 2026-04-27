# Tester review — 002 (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage
NO

Mapping:
  - AC 1 (`vscodeFolderUrl` exported from viewer.ts) → smoke regex `/export\s+function\s+vscodeFolderUrl/` + unit test import ✓
  - AC 2 (`("/srv/projects/", "alpha")` → `"vscode-insiders://file/srv/projects/alpha"`) → unit test line 6–8 ✓
  - AC 3 (trailing-slash-tolerant on projectsRoot) → unit test line 11–14 ✓
  - AC 4 (undefined projectsRoot → `"vscode-insiders://file/<projectId>"`) → unit test line 17–19 ✓
  - AC 5 (anchor with text `Folder ↗`, title, **href from `vscodeFolderUrl`**, **placed between `VSCode ↗` and `open ↗`**) → **PARTIALLY UNCOVERED** — smoke only string-greps for `Folder ↗` and the title literal; no assertion that href derives from `vscodeFolderUrl`, no assertion of positional ordering between the two existing anchors
  - AC 6 (`bun test apps/frontend/src/dashboard/viewer.test.ts` passes) → implicit ✓

### 2. Adversarial gap
YES

Concrete bypasses an implementer could ship that pass both gates while violating intent:

a. Put `Folder ↗` and `Open project folder in VSCode Insiders` in a TypeScript **comment block** in `viewer.ts`. The smoke `source.includes(...)` returns true. No anchor is actually rendered.

b. Render the anchor with a **hardcoded** `href="vscode-insiders://file/hardcoded"` (or omit `href` entirely). Nothing in either gate ties the anchor's `href` to a call of `vscodeFolderUrl(projectsRoot, projectId)`.

c. Place the anchor at the **end** of the header bar (after `download`) or at the **start** (before `VSCode ↗`). Constraint says "between `VSCode ↗` and `open ↗`" but nothing asserts ordering.

d. Export `vscodeFolderUrl` as required, but never call it from the render path. Both gates still pass.

### 3. Coverage gap
YES

Uncovered testable properties:
  - **Anchor ordering**: that the rendered DOM/HTML places `Folder ↗` after `VSCode ↗` and before `open ↗`. Observable via index-of comparisons on rendered HTML.
  - **Href wiring**: that the anchor's `href` attribute equals `vscodeFolderUrl(projectsRoot, projectId)` for some realistic input (i.e., the production render path actually invokes the helper).
  - **Anchor is rendered, not commented**: distinguishing "string appears in source file" from "anchor appears in rendered output."

### 4. Behavior vs implementation detail
NO — gates are not behavior-pinned at the e2e layer.

The smoke script is a **source-text grep**, not a behavioral check:

```ts
const source = readFileSync(VIEWER_PATH, "utf-8");
if (!/export\s+function\s+vscodeFolderUrl/.test(source)) { ... }
if (!source.includes("Folder ↗")) { ... }
if (!source.includes("Open project folder in VSCode Insiders")) { ... }
```

Constitution §4 requires `kind: code` e2e gates to be smoke scripts asserting "the rendered HTML / behavior." A regex over `.ts` source is implementation-detail coupling at its weakest form: it matches comments, string literals in unrelated functions, dead code, etc. A version of `viewer.ts` that satisfies the grep but renders nothing of the sort would still pass.

The unit test (`viewer.test.ts`) is correctly behavior-pinned for the pure helper. The problem is exclusively the e2e layer.

## Verdict summary

FAIL. The unit gate cleanly covers AC 2–4 and AC 6. The e2e gate covers AC 1 (export) but degenerates into source-grep for AC 5, leaving four adversarial bypasses (comment-only, hardcoded href, wrong ordering, helper-never-called) and three coverage gaps (ordering, href wiring, rendered-vs-commented). Required correction: replace the source-grep smoke with a script that exercises the actual viewer render path — invoke whatever exported render helper produces the header HTML (or import the module and render to a string/JSDOM), then assert against the rendered output: anchor exists, its `href` equals `vscodeFolderUrl(testRoot, testProjectId)`, its `title` matches, and its index in the header sits strictly between the `VSCode ↗` and `open ↗` anchors. Spec-tester decides the exact assertion shape; judge only names the gap.
