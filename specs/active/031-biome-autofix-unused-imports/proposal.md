---
id: 031-biome-autofix-unused-imports
title: Mark biome's noUnusedImports fix as safe to auto-apply in pre-commit
status: active
kind: workflow
gate: scripts/smoke-biome-autofix-unused-imports.ts
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
---

## Intent

Biome 2.4.7 classifies the `noUnusedImports` auto-fix as "unsafe" because removing an `import` statement could theoretically break code that depends on side effects. In practice every silent-rollback we hit during specs 028 and 029 was a leftover named import after a refactor — the fix would have been entirely safe. Override biome's classification per-rule via `biome.json`'s `fix: "safe"` field so `--write` (the existing pre-commit invocation) auto-removes unused imports without us needing to globally enable `--unsafe`. Eliminates the most common cause of pre-commit rejection without expanding the unsafe-fix surface to every other rule.

## Constraints

- Single edit to `biome.json` — change `noUnusedImports: "error"` to `noUnusedImports: { level: "error", fix: "safe" }`.
- No change to `lefthook.yml`, `package.json`, or any pre-commit invocation. The existing `bunx biome check --write --no-errors-on-unmatched ...` command picks up the override transparently.
- No change to other linter rules' classifications. The override is scoped to `noUnusedImports` only.
- Smoke must be hermetic — creates a tmp TypeScript file with an unused named import, runs `bunx biome check --write` against it (no `--unsafe`), asserts the file is rewritten with the import removed AND biome exits 0.
- The smoke must also assert the inverse on the original config — to prevent the test from passing trivially in a future where biome upstream marks the fix as safe by default. Achieved by snapshot-asserting that the override is present in `biome.json`.

## Acceptance criteria

- [ ] `biome.json` declares `noUnusedImports` as `{ level: "error", fix: "safe" }`
- [ ] `scripts/smoke-biome-autofix-unused-imports.ts` exits 0 when the override is present and biome auto-removes a leftover unused import; exits 1 otherwise
- [ ] `bun run tasks:verify` exits 0
- [ ] Out-of-band: re-running `bun install` is NOT required — biome reads `biome.json` at every invocation, so the fix is live in pre-commit immediately on next commit

## Context

/retro 2026-05-08 (seventh) finding #1 — formerly deferred-finding #2 of the sixth retro. Spec 030 added a clear `✖ COMMIT REJECTED` marker on biome failures (signal). This spec removes the most common cause of those failures (root cause). Together they retire the silent-rollback class.
