# Specs

Every change to production code lands as a spec. The flow is:

```
align → /do <intent>
        ├── spec-tester    writes proposal/design/tasks + RED gate
        ├── spec-judge     reviews tests against intent (kind:code only)
        └── spec-implementer  writes code that turns gate GREEN
        → spec:complete    (script ticks tasks from git truth, archives)
        → push + PR + auto-merge
```

## Layout

- `_template/` — shape for new specs (proposal.md, design.md, tasks.md)
- `active/NNN-slug/` — work in flight
- `archive/YYYY-MM-DD-NNN-slug/` — completed, immutable
- `constitution.md` — repo invariants enforced by hooks + scripts

## Skills

- `/do <intent>` — opens a worktree, runs the dual-agent TDD chain, opens the PR
- `/retro [--since 7d]` — scans traces + archive, authors a follow-up rule/workflow spec

## Scripts

- `bun run spec:lint` — frontmatter + dependency cycle + gate-existence checks
- `bun run tasks:verify` — runs every active spec's gate + boundary checks
- `bun run spec:complete <slug>` — verifies + ticks + archives + commits
- `bun scripts/worktree-open.ts <slug>` — creates `.agentic/worktrees/<slug>` on `spec/<slug>` from main
- `bun scripts/worktree-close.ts [<slug>]` — removes merged worktrees (auto-detects, or single-slug strict)

See `constitution.md` for the full set of invariants.
