---
id: 036-e2e-smoke
title: Add Playwright e2e smoke suite with CI job and pre-push hook
status: active
kind: workflow
gate: scripts/smoke-e2e-harness.ts
created: 2026-05-08T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
---

## Intent

pier currently has unit and integration coverage but no end-to-end signal that the frontend and backend boot together and serve their primary contracts. This spec adds a minimal Playwright smoke suite that boots both apps and asserts (a) the backend `/health` endpoint returns `{status:"ok"}` and (b) the frontend home page renders with the expected document title. The suite runs in a dedicated CI job and as a pre-push lefthook command, giving a fast end-to-end gate before any change reaches main.

## Constraints

- Smoke runs against the actual booted services (Astro dev for frontend, Bun for backend) — no mocks at the HTTP layer.
- e2e workspace lives at `apps/e2e/`, isolated from `bunx turbo check:local` so local typecheck/test stays fast.
- CI runs e2e as a separate job (`needs: check`) so a failing smoke is distinguishable from a failing unit/lint.
- Pre-push hook forces a fresh server boot via `E2E_FRESH=1` (Playwright `reuseExistingServer` is disabled when this flag is set or when `CI` is set).
- Single Chromium browser only — keeps install + run cost bounded.
- No new dependencies in production workspaces; Playwright + `@types/node` confined to `apps/e2e/`.

## Acceptance criteria

- [ ] AC 1: `bun run e2e` against running pier dev servers passes both smoke tests in under 5 seconds.
- [ ] AC 2: `bun run e2e:fresh` boots backend on `:5273` and frontend on `:5274` from cold and passes both tests.
- [ ] AC 3: New `e2e:` GitHub Actions job runs `bunx turbo e2e`, uploads `playwright-report/` on failure, and gates the workflow alongside `check`.
- [ ] AC 4: `pre-push` lefthook entry runs `bun run e2e:fresh` in parallel with `bunx turbo check:local`.
- [ ] AC 5: `bun run spec:lint` and `bun run tasks:verify` pass with this spec active.

## Context

Backend deploys to Cloudflare Workers but the dev runtime is Bun. The smoke booting via `bun run --watch src/main.ts` is a known fidelity gap; a future spec can swap to `wrangler dev` for backend in e2e. This spec deliberately keeps scope to a single browser, two assertions, and the workspace + CI + hook wiring so that subsequent specs can grow the suite without re-litigating the harness.
