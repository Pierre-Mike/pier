# Design

## Approach

Add a single `.filter` inside `findCastViolations` that drops any file whose path ends with `.test.ts` or `.test.tsx` before the content scan. `collectTsFiles` is untouched — it stays general so other invariants can still inspect test files.

```
findCastViolations(dir, repoRoot):
  collectTsFiles(dir)
    .filter(f => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))   // NEW
    .filter(f => readFile(f).includes("as unknown as"))
    .map(f => f.replace(repoRoot, ""))
```

## Files touched

- `packages/api-contract/src/invariants.ts` — add the carve-out filter in `findCastViolations`.
- `packages/api-contract/src/invariants.test.ts` — add test case for the carve-out (gate).

## Decisions

- **Filter in rule, not walker** — `collectTsFiles` is reused by other invariants that may legitimately need to inspect test files. Putting the carve-out at the rule layer keeps the walker general.
- **`.test.ts` / `.test.tsx` only** — matches the biome.json `overrides` pattern; no other test-file conventions exist in this repo.

## Risks

- None material. The change is a two-condition filter on file names; existing behavior for non-test files is identical.

## Out of scope

- Carve-outs for other invariant functions (`hasOnlyAllowedDeps`, `collectTsFiles`).
- Changes to CI workflow YAML (already correct once the function is fixed).
