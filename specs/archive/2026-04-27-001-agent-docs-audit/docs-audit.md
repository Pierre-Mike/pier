---
required_sections:
  - All Checks Complete
---

# Agent Docs Audit — Rubric Matrix

## Rubric

Six items are assessed for each agent file:

| item | description |
|------|-------------|
| identity | File opens with a clear role-identity statement (who this agent is, one sentence) |
| inputs | Documents what the agent reads before acting (files, env vars, dispatch prompt fields) |
| outputs | Documents what the agent writes and to which paths |
| forbidden-paths | Lists paths/directories the agent must NOT edit |
| exit-condition | Specifies the exact text or state the agent prints/sets to signal completion |
| escalation-refs | Links to constitution path and template path; names retry/escalation behaviour |

## What GREEN looks like

Every box in the matrix below is `- [x]`, AND `git diff` shows all three agent files modified.

## Audit Matrix

| agent | rubric item | status | finding | fix |
|-------|-------------|--------|---------|-----|
| spec-tester | identity | - [x] | Role stated in frontmatter description and opening paragraph; clear one-sentence framing. | ok — no patch needed |
| spec-tester | inputs | - [x] | No explicit "Inputs" section — dispatch prompt fields and files read before acting were undocumented. | Added `## Inputs` listing dispatch prompt fields, template paths, constitution path, and retry brief. |
| spec-tester | outputs | - [x] | Outputs scattered across Responsibilities prose but no consolidated list. | Added `## Outputs` listing all four authored files. |
| spec-tester | forbidden-paths | - [x] | Paths mentioned across Scope and Boundaries but not consolidated in one place. | Added `## Forbidden paths` as a single authoritative list. |
| spec-tester | exit-condition | - [x] | Exact exit text templates present for both success and failure outcomes. | ok — no patch needed |
| spec-tester | escalation-refs | - [x] | No reference to `specs/constitution.md` or `specs/_template/` paths anywhere in the file. | Added `## References` section linking constitution, template paths, and sibling agent files. |
| spec-judge | identity | - [x] | Role stated in frontmatter description and opening paragraph with clear one-sentence framing. | ok — no patch needed |
| spec-judge | inputs | - [x] | Files readable listed under Scope but not framed as an "Inputs" section; no mention of reading design.md or prior tester-review.md on retry. | Added `## Inputs` section listing proposal.md, design.md, gate files, and retry tester-review.md. |
| spec-judge | outputs | - [x] | tester-review.md and .gate-frozen documented in Scope/Verdict sections. | ok — consolidated in new `## Outputs` section for clarity. |
| spec-judge | forbidden-paths | - [x] | Read restrictions scattered across Scope prose but no dedicated forbidden-paths section. | Added `## Forbidden paths` listing read and write prohibitions explicitly. |
| spec-judge | exit-condition | - [x] | No exit text template — file only says "exit" with no specified print format. | Added `## Exit condition` with exact print templates for PASS, FAIL, and ESCALATION outcomes. |
| spec-judge | escalation-refs | - [x] | No reference to `specs/constitution.md` or `specs/_template/` paths. | Added `## References` section linking constitution, template, and sibling agent files. |
| spec-implementer | identity | - [x] | Role stated in frontmatter description and opening paragraph; clear one-sentence framing. | ok — no patch needed |
| spec-implementer | inputs | - [x] | Explicit "Read:" list in Step 6 covers proposal.md, design.md, tasks.md, tester-review.md, gate files. | ok — no patch needed |
| spec-implementer | outputs | - [x] | Outputs documented across Steps 6-9 (modified files, spec:complete commit, PR, CI checks). | ok — no patch needed |
| spec-implementer | forbidden-paths | - [x] | Dedicated "Forbidden paths" section plus "Do not touch" section cover gate, .gate-frozen, tester-review.md, main, archive, package.json. | ok — no patch needed |
| spec-implementer | exit-condition | - [x] | Exact print templates for CI green (auto-merged) and CI red outcomes present in Step 10. | ok — no patch needed |
| spec-implementer | escalation-refs | - [x] | References `specs/constitution.md` inline and has blocker.md escalation section, but no reference to `specs/_template/` paths. | Added `## References` section linking constitution, template paths, and sibling agent files. |

## All Checks Complete

All 18 rubric cells are ticked. All three agent files have been patched. `git diff` confirms modifications to `.claude/agents/spec-tester.md`, `.claude/agents/spec-judge.md`, and `.claude/agents/spec-implementer.md`.
