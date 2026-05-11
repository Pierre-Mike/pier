# Design

## Approach

Mechanical version bump across the four workflow files. The gate script greps every `.github/workflows/*.yml` for references to the four target actions and asserts each is pinned at the required major. Any leftover `@v[0-4]` reference for `checkout`/`setup-node`, any `@v[0-3]` for `cache`, or any `@v[0-5]` for `upload-artifact` fails the gate.

## Files touched

- `.github/workflows/ci.yml` — 4 checkout, 2 setup-node, 3 cache, 1 upload-artifact
- `.github/workflows/github-branch-rule.yml` — 1 checkout
- `.github/workflows/on-prd.yml` — 2 checkout, 1 setup-node, 1 cache
- `.github/workflows/on-rfc.yml` — 1 checkout
- `scripts/smoke-bump-gh-actions.ts` — workflow gate

## Decisions

- **Latest majors, not v5 across the board** — checkout/setup-node already have v6; pinning to v5 would just defer the next bump. Each action lives on its own release cadence; pin to its current latest major.
- **Major-tag pinning, not SHA** — repo convention is `@v4`/`@v5` etc. SHA pinning would be safer but a much larger semantic change; out of scope for this bump.
- **Single spec, single PR** — the four workflows form one coherent unit; splitting per-file would create useless churn.

## Risks

- **upload-artifact v7 breaking changes** — v5 onward stopped supporting Node 16 and v7 may have changed the default retention or compression behavior. We only use it for `playwright-report/` on e2e failure; verify the report still uploads on a deliberately failing run if a regression appears later.
- **on-prd.yml / on-rfc.yml are higher-stakes workflows** — these handle PRD/RFC issue automation. Bumping checkout from v4 → v6 should be transparent (no API change in our usage), but a wrong bump would silently break issue triage. Mitigation: humans manually trigger these and would notice; no auto-merge depends on them.

## Out of scope

- SHA pinning of action versions.
- Bumping any non-`actions/*` third-party actions (none currently present).
- Switching Node version in `setup-node`'s `node-version:` input (still `"22"`).
