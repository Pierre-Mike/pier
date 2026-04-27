---
id: NNN-slug
title: Short descriptive title
status: active
kind: code | rule | workflow | writeup
# kind:code requires ≥1 unit + ≥1 integration|e2e entry (typed list):
gate:
  - path: apps/backend/src/core/foo.test.ts
    level: unit
  - path: scripts/smoke-foo.ts
    level: e2e
# For non-code kinds, scalar (legacy) is accepted:
#   gate: path/to/gate/artifact
created: YYYY-MM-DD
owner: main
depends_on: []
supersedes: null
---

## Intent

One paragraph. Why does this exist? What user-visible or system-visible change does it produce?

## Constraints

- Bullet list of hard requirements
- Explicit non-goals

## Acceptance criteria

- [ ] Observable condition 1 (encoded in the gate)
- [ ] Observable condition 2

## Context

Link to related specs, issues, or external references.
