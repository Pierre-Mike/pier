---
id: 001-agent-docs-audit
title: Audit agent docs for completeness
status: active
kind: writeup
gate: specs/active/001-agent-docs-audit/docs-audit.md
created: 2026-04-27
owner: main
depends_on: []
supersedes: null
---

## Intent

The three `.claude/agents/*.md` files drive subagent behaviour across the spec-on-rails pipeline. Currently, a fresh subagent dispatched from one of those files may encounter gaps: missing role identity prose, undocumented inputs/outputs, absent forbidden-path lists, vague exit conditions, or no references to the constitution or template paths it needs. This spec audits each agent file against a shared six-item rubric and patches every gap found, so the files are self-contained enough for a cold-start subagent to execute its role correctly without implicit knowledge from `/do`.

## Constraints

- No structural rewrites — the agent files already work; only fill documented gaps.
- No new agent files created.
- Audit covers exactly three files: `spec-tester.md`, `spec-judge.md`, `spec-implementer.md`.
- Rubric is fixed at six items: identity, inputs, outputs, forbidden-paths, exit-condition, escalation-refs.
- Gate file (`docs-audit.md`) is the sole deliverable; no code changes.

## Acceptance criteria

- [ ] `docs-audit.md` exists at `specs/active/001-agent-docs-audit/docs-audit.md`
- [ ] Every rubric cell in the matrix is ticked (`- [x]`)
- [ ] `git diff` shows all three `.claude/agents/` files modified

## Context

Spec-on-rails architecture: `specs/constitution.md`, `specs/_template/`.
Agent files: `.claude/agents/spec-tester.md`, `.claude/agents/spec-judge.md`, `.claude/agents/spec-implementer.md`.
