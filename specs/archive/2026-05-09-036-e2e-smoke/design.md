# Design

## Approach

Add a new bun workspace `apps/e2e/` containing Playwright config and tests. Playwright's `webServer` array boots backend (`bun --filter @pier/backend run dev`, port 5273) and frontend (`bun --filter @pier/frontend run dev`, port 5274) in parallel, with backend env pointed at fixture dirs under `apps/e2e/fixtures/` so artifact/claude/projects watchers operate on empty trees instead of `~/.pi` and `~/.claude/projects`. `reuseExistingServer` is true for local dev (fast feedback against a running pier) and false when `CI` or `E2E_FRESH` is set (clean boot guarantee for CI and pre-push). Two smoke specs validate `/health` (request fixture, no browser) and `/` (Chromium page load + title assertion). Turbo already exposes an `e2e` task in `turbo.json`; the workspace's `e2e` script (`playwright test`) wires in. CI gets a new `e2e:` job that runs after `check` and uploads the HTML report on failure. Lefthook gets a parallel pre-push command.

## Files touched

- `apps/e2e/package.json` — new workspace with `@playwright/test`, `@types/node`, `typescript` devDeps and `e2e`, `e2e:install`, `typecheck` scripts
- `apps/e2e/tsconfig.json` — extends `tsconfig.base.json`, `types: ["node"]`
- `apps/e2e/playwright.config.ts` — single Chromium project, two webServers, fixture-dir env for backend, retries on CI, html report on CI
- `apps/e2e/tests/smoke.spec.ts` — `/health` ok + frontend `/` renders title `pier`
- `apps/e2e/.gitignore` — `playwright-report/`, `test-results/`, `fixtures/`, `.cache/`
- `package.json` — `e2e`, `e2e:fresh`, `e2e:install` root scripts
- `.github/workflows/ci.yml` — new `e2e:` job (`needs: check`) with bun + playwright caches and report-on-failure upload
- `lefthook.yml` — `pre-push.commands.e2e` running `bun run e2e:fresh` (parallel with existing `check`)
- `bun.lock` — locked Playwright + @types/node

## Decisions

- **`workflow` kind, not `code`** — this is dev/CI infrastructure, not product behavior. Matches spec 029 (post-merge worktree sweep) which is also workflow with a smoke gate.
- **Workspace at `apps/e2e/`, not under `apps/frontend/`** — keeps Playwright deps out of the frontend tree and lets us boot multiple services as peers.
- **`reuseExistingServer` controlled by `CI || E2E_FRESH`** — local `bun run e2e` is a 2-second sanity check against the running dev session; pre-push and CI force clean boot for fidelity.
- **Two `webServer` entries instead of `bun run dev` (turbo)** — turbo dev is persistent and parallel, but Playwright wants per-server URLs to wait on. Splitting lets us point at `:5273/health` and `:5274` independently.
- **Single Chromium only** — Firefox/WebKit add ~200MB cache and 2× run time for negligible smoke value. Add browsers later if a real cross-browser regression appears.
- **`bun run e2e:install` at root, not in CI inline** — same script works locally and in CI; cuts duplication.
- **Backend env points watchers at `apps/e2e/fixtures/`** — backend's artifact and claude-events watchers default to `~/.pi/artifacts` and `~/.claude/projects`. In CI those dirs may not exist; in local dev they contain unrelated state. Fixture dirs under the e2e workspace are gitignored and pre-created in the CI workflow.
- **`PIGUY_ZELLIJ_URL` set to an unreachable port** — `ensureZellijWeb` is wrapped in `Effect.orElseSucceed`, so an unreachable URL is the cheapest way to skip zellij sidecar boot in tests.

## Risks

- **Bun-vs-Workers fidelity** — backend boots in Bun in e2e but deploys to Cloudflare Workers. Smoke that passes here can fail on Workers (e.g., Bun-specific APIs). Mitigation: documented in proposal.md as a known gap; future spec can swap to `wrangler dev`.
- **Pre-push latency** — fresh boot adds ~30-45s per push. Mitigation: runs in parallel with `check:local`; user can skip via `git push --no-verify` in emergencies.
- **Port collisions** — `:5273/:5274/:5275` are pier's standard dev ports. If a stale pier is running, fresh boot will fail to bind. Mitigation: `reuseExistingServer: true` for non-fresh local runs covers the common case; fresh failures surface immediately as a clear error.
- **Chromium cache size in CI** — ~150MB. Mitigation: cached at `~/.cache/ms-playwright` keyed by `apps/e2e/package.json` hash.

## Out of scope

- Cross-browser coverage (Firefox/WebKit).
- Real user flows beyond smoke (login, artifact creation, session lifecycle).
- `wrangler dev` for backend in e2e (separate spec).
- Visual regression / screenshot diffs.
- Parallelization across multiple workers (set to 1 to avoid port races).
