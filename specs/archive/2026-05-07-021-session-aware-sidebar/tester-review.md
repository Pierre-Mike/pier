# Tester review — 021-session-aware-sidebar (attempt 3)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
  - AC 1 (`filteredProjects` returns session-bearing projects) → `filteredProjects — spec 021 › filteredProjects includes projects that have an active session` ✓ (companion: `respects projectFilter when filtering by name`, `still includes projects without a session`)
  - AC 2 (sessions list ctx menu invokes `openSessionContextMenu`, not `openProjectContextMenu`) → `renderSessions context menu split — spec 021 › calls openSessionContextMenu (not openProjectContextMenu)` and `does NOT call openProjectContextMenu` ✓
  - AC 3 (`openSessionContextMenu` shows only "Delete session" + calls `closeSession`) → `openSessionContextMenu — spec 021` block: `shows Delete session item`, `calls closeSession`, exclusivity `does NOT contain Open on GitHub label`, `does NOT contain github-url fetch` ✓
  - AC 4 (bottom projects list ctx menu still invokes `openProjectContextMenu`) → `renderProjects context menu — spec 021 › still calls openProjectContextMenu` ✓ (also reinforced by re-routed spec-020 block)
  - AC 5 (sidebar `<li>` carries `user-select: none`) → `sidebar li user-select — spec 021` block: CSS-pair OR inline-style assertion + comment-bypass guard ✓
  - AC 6 (backend `close` Effect spawns `zellij delete-session --force <id>`, 2 s race, swallow via `console.warn`) → `TerminalSessions Live close — spec 021` block: `spawns zellij delete-session --force <id>`, `contains a 2-second timeout reference`, `swallows errors with console.warn` (catch combinator + console.warn), `does NOT call console.error` ✓

Open-dot rendering Constraint (`li.open .dot`) → `renderProjects body adds 'open' class for session-bearing projects` ✓

### 2. Adversarial gap
NO — searched, found none structural after re-route.

Re-route consistency check (the load-bearing re-review item): spec-020 re-routed assertions (lines 57-106) target `renderProjectsBody` — `addEventListener("contextmenu"`, `ev.preventDefault()`, `openProjectContextMenu`, `id: p.id`, clientX/clientY, plus whole-file checks for `github-url`, `_blank`, `noopener,noreferrer`, missing-remote toast. spec-021 (lines 190-209) asserts `renderSessionsBody` contains `openSessionContextMenu` AND does NOT contain `openProjectContextMenu`. spec-021 (lines 251-256) asserts `renderProjectsBody` contains `openProjectContextMenu`. A valid implementation — `renderProjects` wires `openProjectContextMenu` (preserves spec-020 behavior on the bottom list), `renderSessions` wires `openSessionContextMenu` (the new spec-021 menu) — satisfies all three blocks simultaneously. No contradiction.

Minor (non-blocking): the user-select test accepts a CSS pair anywhere in `projects.ts` rather than enforcing the sidebar `li` selector. Tighter coupling would tie tests to CSS-text shape; the structural-token guard (must appear near `{`, `;`, or `=`) is a reasonable proxy for code-kind.

### 3. Coverage gap
NO — none.

All six AC plus the `li.open .dot` Constraint are covered. The post-split `preventDefault` regression on `renderSessions` is asserted at line 207 (`renderSessions contextmenu handler calls ev.preventDefault() — spec 021 forward`).

### 4. Behavior vs implementation detail
YES — appropriately pinned for a code-kind unit gate.

`filteredProjects` is imported and called against a populated `store` (lines 116-169) — that's true behavioral coverage. The wiring assertions (`renderSessions`/`renderProjects`/`openSessionContextMenu`/close-body) use scoped source extraction because these symbols are not exported and there is no DOM seam in the gate's runtime. The extractor regex tolerates `function`, `const = (`, and `const = async (` shapes, so it survives reasonable refactors. No version-fragile coupling, no library-error-string pins.

## Verdict summary

PASS. The surgical re-route at commit 932c9d7 correctly moves spec-020 assertions from `renderSessionsBody` to `renderProjectsBody`, resolving the prior internal contradiction that withdrew the attempt-2 PASS. The spec-021 `renderSessions` and `renderProjects` blocks are now mutually consistent: a valid implementation wires `openProjectContextMenu` in `renderProjects` and `openSessionContextMenu` in `renderSessions`, satisfying every assertion in the gate. Backend gate untouched and continues to satisfy the rubric as at attempt 2. All six AC plus the open-dot Constraint are mapped; no coverage gaps; tests behavior-pinned to the extent possible for a code-kind unit gate.
