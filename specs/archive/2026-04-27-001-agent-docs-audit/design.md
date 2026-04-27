# Design

## Approach

Read each agent file cold. Score against the six-item rubric. For each gap found, record the finding, patch the agent file inline (tighten or add the missing prose), then mark the rubric cell done. No structural rewrites — additive patches only.

## Files touched

- `.claude/agents/spec-tester.md` — patch whatever rubric items are missing
- `.claude/agents/spec-judge.md` — patch whatever rubric items are missing
- `.claude/agents/spec-implementer.md` — patch whatever rubric items are missing
- `specs/active/001-agent-docs-audit/docs-audit.md` — fill `finding` + `fix` columns, tick all boxes, add `## All Checks Complete` section

## Decisions

1. **Single matrix table** — 18 rows (3 agents × 6 rubric items), columns `agent | rubric | status | finding | fix`. Scannable; one file to review. Rejected: separate per-agent files (more overhead, harder to diff at a glance).

2. **Verification via required_sections** — `checkWriteup` reads `required_sections` from the gate file's own frontmatter and asserts each heading exists. RED gate declares `required_sections: ["All Checks Complete"]`. The `## All Checks Complete` heading is absent in RED and added by the implementer only after every box is ticked. This keeps the RED/GREEN signal in the gate file itself without custom script logic.

3. **Tester scope is skeleton only** — Tester writes rubric matrix with all `- [ ]` and empty `finding`/`fix` cells. Implementer reads agent files, fills findings, patches agents, ticks boxes. Clean separation: tester defines the bar, implementer clears it.

## Risks

- Agent files may have partial coverage of some rubric items — implementer must judge completeness, not just presence of any mention.

## Out of scope

- Structural rewrites of agent files.
- New agent files.
- Changes to `scripts/`, `src/`, or any implementation path.
- Adding new rubric items beyond the declared six.
