---
id: 011-backend-feature-slice-plan
title: Plan — refactor backend from horizontal layers to feature slices (FCIS preserved)
status: active
kind: writeup
gate: specs/active/011-backend-feature-slice-plan/design.md
created: 2026-04-30
owner: main
depends_on: []
supersedes: null
---

## Why

`apps/backend/src/{core,infra,shell}/` is **package-by-layer** (stage 2 in the FCIS+Locality+Deep-Modules synthesis hierarchy). Adding or changing a feature touches 3-4 directories. With ~10 features now in flight (artifacts, events, projects, sessions, zellij, tunnel, settings, config, version, health), the layered fan-out is quantifiably hurting:

- "artifacts" feature spans **7 files across 3 directories**: `core/artifact-classify.ts`, `core/blob-classify.ts`, `infra/artifact-watcher.ts`, `infra/blob-server.ts`, `shell/routes/artifacts.ts`, `shell/routes/artifacts-blob.ts`, `shell/routes/stream-artifacts.ts`.
- `git log core/` cannot tell any feature's story.
- `rm -rf` cannot remove a feature cleanly.
- Cross-feature coupling has zero compiler enforcement (e.g. `infra/artifact-watcher.ts` could import `infra/projects.ts` today and depcruise would not flag it).

The FCIS discipline (core / infra / shell) is **preserved**, just rotated 90° — tier becomes a filename suffix, feature becomes a folder.

## What

Move `apps/backend/src/{core,infra,shell}/` → `apps/backend/src/{features/<name>/, platform/}` with `<feature>.<tier>.ts` naming. Replace depcruise rules with cross-feature isolation + within-slice purity. No behavior change.

## Scope

- **In**: `apps/backend/src/**`, `apps/backend/.dependency-cruiser.cjs`, `apps/backend/src/boundary-rules.ts`, `AGENTS.md` (Monorepo Structure + boundary section), this spec.
- **Out**: `apps/frontend/**` (separate spec), `packages/api-contract/**` (no change needed), spec workflow, hooks, CI, migrations.

## Outcome

- Stage-4 layout: `features/<name>/<name>.<core|repo|routes|migration|fixture>.ts`.
- New depcruise rules: cross-feature imports forbidden; within-slice core stays pure.
- `git log features/artifacts/` tells the artifact feature's story.
- `bun run check` green at every PR boundary.
- `boundary-rules.ts` updated; tests for new rules added.

## Gate

This is a `kind: writeup`. The gate is `design.md` — the plan itself. Once approved, follow-up `kind: code` specs (one per migration PR) cleave off the design's PR plan.
