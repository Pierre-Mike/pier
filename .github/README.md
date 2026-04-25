# .github

GitHub-specific configuration: CI/CD workflows, branch protection, and code ownership.

## Files

### `CODEOWNERS`

Declares required human reviewers for infrastructure files — CI config, AI instructions, build tooling, deployment config. Any PR touching these files requires approval from `@Pierre-Mike`. This prevents AI agents from silently modifying the guardrails that govern them.

### `branch-rules.json`

Declarative definition of `main` branch protection rules:

- PRs required (no direct push)
- 1 approving review + CODEOWNERS review
- All CI checks must pass before merge
- Force pushes and branch deletion disabled
- Rules enforced for admins too

This file is the source of truth. It is applied automatically on every merge to `main` via the `github-branch-rule.yml` workflow.

### `setup.sh`

One-time bootstrap script to apply branch protection rules when creating a new repo from this template. Run it once after `gh auth login`.

```bash
.github/setup.sh
```

Requires: `gh` CLI + `jq`.

### `workflows/ci.yml`

CI pipeline that runs on every push/PR to `main`:

| Job | What it does |
|-----|-------------|
| `Type Check` | `tsc --noEmit` across the monorepo |
| `Biome CI` | Lint + format check |
| `Test` | `bun test --coverage` |
| `Enforce Co-located Tests` | Fails if a `.test.ts` file exists without a matching source file |
| `Secret Scan` | Gitleaks scan on full git history |
| `Build` | `bun run build` after tests pass |

All jobs must pass for a PR to be mergeable (enforced via `branch-rules.json`).

### `workflows/github-branch-rule.yml`

Triggered automatically when `branch-rules.json` changes on `main`. Syncs the branch protection rules to GitHub via the API using a `BRANCH_PROTECTION_TOKEN` secret. This keeps the declared rules and the enforced rules in sync without manual intervention.
