---
id: "039"
title: Fix double-shift palette performance freeze
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/palette.test.ts
    level: unit
  - path: scripts/smoke-039-palette-perf.ts
    level: e2e
created: 2026-05-11
owner: main
depends_on: ["010-double-shift-palette"]
supersedes: null
---

## Intent

The double-shift command palette (spec 010) freezes the app for several seconds on activation when the store contains large numbers of projects or files. Every keydown evaluation runs `buildEntries` and `applyFuzzyFilter` synchronously on the full dataset without any caching or early-exit, causing a perceptible freeze on stores with hundreds of projects or thousands of files. This spec fixes the performance by making the hot path (activation + `getEntries`) complete within one animation-frame budget (16ms) for stores with up to 500 projects and 2000 files.

## Constraints

- The public `PaletteHandle` interface must remain identical to spec 010 — no signature changes.
- No new runtime dependencies.
- Fix is pure algorithmic/structural — memoisation or lazy evaluation of `buildEntries`, not a DOM or async change.
- Spec 010 unit tests must continue to pass unchanged.

## Acceptance criteria

- [ ] AC1: `getEntries("")` on a store with 500 projects + 2000 files completes in under 16ms.
- [ ] AC2: `getEntries("query")` on the same large store completes in under 16ms.
- [ ] AC3: Repeated calls to `getEntries` with the same store snapshot do not rebuild the full entry list each time (cache hit avoids redundant work).
- [ ] AC4: A store change (projects or files mutated between `getEntries` calls) correctly invalidates the cache and returns the updated list.
- [ ] AC5: All spec 010 acceptance criteria (AC1–AC10 in palette.test.ts) remain passing.
- [ ] AC6: The e2e smoke script exits 0 with a 500-project/2000-file store and measures `getEntries` completing under 16ms.

## Context

- Spec 010 (`specs/archive/*/010-double-shift-palette/`) introduced `installPalette`.
- The freeze is reproducible by calling `getEntries("")` with large store snapshots — each call re-sorts and re-maps the full project list via `Array.sort` + `Array.map` + spread.
- Likely fix: memoize `buildEntries` by snapshot identity (reference equality on `getStore()` return) or by a stable cache key; skip rebuild when the snapshot has not changed.
