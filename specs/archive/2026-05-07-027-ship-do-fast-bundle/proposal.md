---
id: 027-ship-do-fast-bundle
title: Land /do-fast skill bundle under spec governance
status: archived
kind: workflow
gate: scripts/smoke-do-fast-bundle.ts
created: 2026-05-07T00:00:00.000Z
owner: main
depends_on: []
supersedes: null
archived: '2026-05-07'
---

## Intent

Three harness extensions sit uncommitted on main's working tree as of 2026-05-07: `.claude/skills/do-fast/SKILL.md`, `.claude/agents/do-fast-orchestrator.md`, `.claude/agents/spec-fielder.md`. Together they implement `/do-fast` — a faster `/do` variant that skips the align interview when the user already knows the shape of the change. Authoring meta-tools that augment the spec workflow without going through that workflow violates the repo's "every change via /do" discipline. Land them on a spec branch via the standard rails.

## Constraints

- Move all three paths into the spec branch as-is (no behavioural edits).
- The smoke must be hermetic — it reads the three files via fs and parses their frontmatter; no `claude` invocation, no skill loading.
- No edits to `/do`, `/retro`, or any other existing skill/agent. The bundle is additive.
- `spec-fielder` and `do-fast-orchestrator` agent files must declare valid `name:` frontmatter so the dispatch pseudocode in `SKILL.md` resolves.

## Acceptance criteria

- [ ] `.claude/skills/do-fast/SKILL.md` exists in the spec branch with `name: do-fast` and a non-empty `description:` field
- [ ] `.claude/agents/do-fast-orchestrator.md` exists with a `name:` frontmatter field
- [ ] `.claude/agents/spec-fielder.md` exists with a `name:` frontmatter field
- [ ] `scripts/smoke-do-fast-bundle.ts` exits 0 when all three above hold and exits 1 with a clear diagnostic otherwise
- [ ] `bun run tasks:verify` exits 0

## Context

/retro 2026-05-07 (third of the day) finding #1 — formerly deferred-finding #2 of the second retro. Unblocked once spec 026 fixed the preflight regression that was preventing any `/do` invocation. Bundle was authored during the orchestrator-app session on 2026-05-05/06 (trace `e43a4f72`) and has been validated by the same session that built it; this spec is the formalisation step.
