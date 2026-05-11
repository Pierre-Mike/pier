---
id: "999-pass"
title: Fixture pass spec — frontend target with e2e gate
status: active
kind: code
gate:
  - path: apps/frontend/src/pages/index.test.ts
    level: unit
  - path: apps/e2e/tests/fixture-pass.spec.ts
    level: e2e
created: 2026-05-11
owner: main
depends_on: []
supersedes: null
---

## Intent

Fixture spec for 043-require-frontend-e2e-gate gate testing. This spec touches
apps/frontend/src/pages/ and declares an apps/e2e/tests/*.spec.ts gate entry —
the validateFrontendE2eGate check should pass.

## Constraints

- Fixture only — not a real spec.

## Acceptance criteria

- [ ] Gate passes validateFrontendE2eGate check.
