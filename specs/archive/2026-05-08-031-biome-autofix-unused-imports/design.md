# Design

## Approach

One-line edit in `biome.json`. The smoke spawns `bunx biome check --write` against a tmp `.ts` file containing a leftover unused named import (`import { join } from "node:path"; export const x = 1;`). With the override in place, biome rewrites the file (removing the import) and exits 0 — proving the auto-fix landed without `--unsafe`.

## Files touched

- `biome.json` — change `correctness.noUnusedImports` from string `"error"` to object `{ "level": "error", "fix": "safe" }`.
- `scripts/smoke-biome-autofix-unused-imports.ts` — new gate.

## Decisions

- **Per-rule override, not global `--unsafe`** — narrow blast radius; we explicitly declare which rule's "unsafe" classification we disagree with. Other unsafe fixes remain opt-in.
- **`fix: "safe"`, not `fix: "none"`** — `safe` lifts the rule into the auto-fix path; `none` would suppress fixes entirely. We want the fix applied, not skipped.
- **Smoke asserts both file-rewritten AND exit 0** — either alone could pass for the wrong reason. File-rewritten without exit-0 would mean biome applied the fix but reported other errors; exit 0 without file-rewritten would mean biome didn't recognise the import as unused. Asserting both pins the contract.
- **Snapshot-assert biome.json contents** — if biome upstream changes the default classification in a future release, the smoke would pass trivially. The snapshot assertion guards against silent drift.

## Risks

- A `noUnusedImports` fix that removes a side-effect-only import (e.g. `import "polyfill"`). Detection: biome already does NOT flag side-effect-only imports as unused — they have no named bindings. Confirmed empirically. Mitigation: trivial — the rule only fires on imports with unused named bindings, and removing those is genuinely safe.
- A future biome major version changes the schema for per-rule fix overrides. Detection: spec-lint and tasks:verify both fail loudly on the next bun install + first `/do`. Mitigation: snapshot-assert in the smoke catches this.

## Out of scope

- Marking other rules' unsafe fixes as safe. Each rule deserves its own evaluation; do them one at a time as they actually cause friction.
- Global `--unsafe` flag in lefthook. Defer indefinitely — broader risk surface, no current signal.
- Removing spec 030's `✖ COMMIT REJECTED` marker. It still serves a purpose for residual lint failures (e.g. `noExplicitAny`).
