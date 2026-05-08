---
id: 037-session-dot-closed-rows
title: Show session-alive dot on closed project rows
status: active
kind: code
gate:
  - path: apps/frontend/src/components/projects.test.ts
    level: unit
  - path: apps/frontend/src/components/projects.integration.test.ts
    level: integration
created: 2026-05-08
owner: main
depends_on:
  - 035-session-dot-close-project
supersedes: null
---

## Intent

Show the green `session-alive-dot` on closed project rows (in the bottom sidebar list and search results) when a live zellij session exists for that project on the backend. Currently the dot appears only on OPEN session rows and the Close Project button (PR #51, spec 035). When a user dismisses a session (×), the project returns to the closed/search list with no dot — even though the zellij session may still be alive on the backend. This change makes the dot's meaning consistent across the entire UI: "a zellij session for this project is alive," regardless of whether the project is currently open.

## Constraints

- Must not modify frozen gate files from specs 034/035 (`apps/frontend/src/dashboard/projects.test.ts`, `apps/frontend/src/dashboard/projects.integration.test.ts`).
- No new npm/bun dependencies.
- The dot styling (`session-alive-dot`) already exists in `apps/frontend/src/styles/dashboard.css`; reuse it unchanged.
- `filteredProjects()` excludes projects in `store.sessions`, so closed projects need a separate alive-session signal: a new `aliveSessions: Set<string>` field in `DashboardState`.
- `aliveSessions` is populated from `/api/sessions` (backend list endpoint) during `refreshProjects`.
- Non-goal: changing how OPEN rows display the dot (spec 035 handles that).
- Non-goal: real-time SSE updates to `aliveSessions` (polling via `refreshProjects` is sufficient).

## Acceptance criteria

- [ ] When a project has a live backend session but is in the closed/search list, its row displays a `.session-alive-dot` element.
- [ ] When a project has no live backend session and is in the closed list, its row does NOT display a `.session-alive-dot` element.
- [ ] `DashboardState` has an `aliveSessions: Set<string>` field tracking project IDs whose backend zellij session is alive.
- [ ] `refreshProjects` populates `store.aliveSessions` from the `/api/sessions` endpoint (filtering for `status: "live"`).
- [ ] `renderProjects` reads `store.aliveSessions` and conditionally adds the dot to each project `<li>`.
- [ ] `renderProjects` does NOT render a dot for projects that are in `store.sessions` (they show up in renderSessions instead) — but since `filteredProjects` already excludes those, this is automatically satisfied.

## Context

- PR #51 / commit dfaafa5 / spec 035 added `session-alive-dot` to OPEN session rows.
- Screenshot evidence: `apps/backend/drops/Screenshot 2026-05-08 at 13.23.14.png` shows `logic-case-studies` in closed list with a live zellij session and no dot.
- Backend: `GET /api/sessions` returns `{ sessions: Session[] }` where `Session.status` is `"live" | "dead"` and `Session.projectId` identifies the project.
- Frontend API client: `api.api.sessions.$get()` (Hono RPC).
