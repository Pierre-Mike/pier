# Design

## Approach

`buildEntries` is called on every `getEntries` invocation, performing a full `Array.sort` + `Array.map` + spread on the projects list and the files list. On a store with 500 projects and 2000 files, each call allocates ~2500 objects and runs a localeCompare sort — enough to stall the main thread.

Fix: add snapshot-identity memoisation inside `installPalette`. Cache the last `StoreSnapshot` reference returned by `getStore()` alongside the `buildEntries` result. On the next `getEntries` call, if `getStore()` returns the same object reference, return the cached `PaletteEntry[]` directly. If the reference has changed, rebuild and cache.

This requires zero new allocations on cache hits, O(1) invalidation check (reference equality), and preserves the public API contract exactly.

## Files touched

- `apps/frontend/src/dashboard/palette.ts` — add `lastSnapshot` and `cachedEntries` state variables; add identity check at the top of `getEntries`; update `selectRowAt` to use the same cached entries when the snapshot is unchanged.
- `apps/frontend/src/dashboard/palette.test.ts` — spec 039 performance tests appended (gate file, authored by spec-tester).
- `scripts/smoke-039-palette-perf.ts` — e2e perf smoke (gate file, authored by spec-tester).

## Decisions

- **Reference equality over deep equality** — shallow reference check (`getStore() === lastSnapshot`) is O(1) and matches the pattern used by React/reactive stores (callers are expected to produce new object references on mutation). Deep equality would be O(n) and defeat the purpose.
- **Cache lives on the handle, not module-level** — each `installPalette()` call gets its own cache; no shared mutable state.
- **`selectRowAt` must also use the cache** — it calls `buildEntries` + `applyFuzzyFilter` internally; refactor so both `getEntries` and `selectRowAt` go through the same cached entries path.

## Risks

- If a caller mutates the snapshot object in-place (rather than replacing the reference), the cache will be stale. This is a caller contract violation (immutability by default per constitution §5) — not defended against by this fix. Document in proposal.md Constraints.

## Out of scope

- Async or chunked rendering of the palette list.
- Virtual scrolling.
- Debouncing the `getEntries` call site in the UI layer.
