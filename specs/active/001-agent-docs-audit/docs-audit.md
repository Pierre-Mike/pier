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
| spec-tester | identity | - [ ] | | |
| spec-tester | inputs | - [ ] | | |
| spec-tester | outputs | - [ ] | | |
| spec-tester | forbidden-paths | - [ ] | | |
| spec-tester | exit-condition | - [ ] | | |
| spec-tester | escalation-refs | - [ ] | | |
| spec-judge | identity | - [ ] | | |
| spec-judge | inputs | - [ ] | | |
| spec-judge | outputs | - [ ] | | |
| spec-judge | forbidden-paths | - [ ] | | |
| spec-judge | exit-condition | - [ ] | | |
| spec-judge | escalation-refs | - [ ] | | |
| spec-implementer | identity | - [ ] | | |
| spec-implementer | inputs | - [ ] | | |
| spec-implementer | outputs | - [ ] | | |
| spec-implementer | forbidden-paths | - [ ] | | |
| spec-implementer | exit-condition | - [ ] | | |
| spec-implementer | escalation-refs | - [ ] | | |
