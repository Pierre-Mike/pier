---
id: 038-bump-gh-actions
title: Bump GitHub Actions to Node 24-capable majors
status: archived
kind: workflow
gate: scripts/smoke-bump-gh-actions.ts
created: 2026-05-11T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-11'
---

## Intent

GitHub's runner deprecates Node 20 on 2026-06-02 (warning on every job, hard cutover 2026-09-16). Our four workflows all use `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`, and `actions/upload-artifact@v4` — all of which run on Node 20. Bump to the current latest major of each so CI keeps working past the cutover and the deprecation warning clears.

## Constraints

- Touch only the `uses:` lines in `.github/workflows/*.yml`. No job logic, step ordering, or env changes.
- Pin to a major tag (e.g. `@v6`), not a SHA or floating tag — matches the existing style and lets minor releases land transparently.
- All four workflows must be consistent: `ci.yml`, `github-branch-rule.yml`, `on-prd.yml`, `on-rfc.yml`.

## Acceptance criteria

- [ ] AC 1: Every `actions/checkout` reference is at `@v6`.
- [ ] AC 2: Every `actions/setup-node` reference is at `@v6`.
- [ ] AC 3: Every `actions/cache` reference is at `@v5`.
- [ ] AC 4: Every `actions/upload-artifact` reference is at `@v7`.
- [ ] AC 5: No `@v4` or `@v3` references remain for any of the four actions above.
- [ ] AC 6: `bun run spec:lint`, `bun run tasks:verify`, and `bunx turbo check:local` all pass.

## Context

Deprecation notice surfaced in PR #54's CI logs: "Node.js 20 actions are deprecated. … Actions will be forced to run with Node.js 24 by default starting June 2nd, 2026." Current latest majors as of 2026-05-11: checkout v6.0.2, setup-node v6.4.0, cache v5.0.5, upload-artifact v7.0.1.
