---
id: "999-fail"
title: Fixture fail spec — frontend target without e2e gate
status: active
kind: code
gate:
  - path: apps/frontend/src/pages/index.test.ts
    level: unit
  - path: scripts/smoke-fixture-fail.ts
    level: integration
created: 2026-05-11
owner: main
depends_on: []
supersedes: null
---

## Intent

Fixture spec for 043-require-frontend-e2e-gate gate testing. This spec touches
apps/frontend/src/pages/ but declares NO apps/e2e/tests/*.spec.ts gate entry —
the validateFrontendE2eGate check should fail with the expected error.

## Constraints

- Fixture only — not a real spec.

## Acceptance criteria

- [ ] Gate fails validateFrontendE2eGate check with expected error message.
