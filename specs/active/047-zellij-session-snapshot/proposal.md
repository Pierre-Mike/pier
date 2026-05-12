---
id: 047-zellij-session-snapshot
title: Add Zellij session snapshot registry
status: active
kind: code
gate:
  - path: apps/backend/src/features/sessions/snapshot.test.ts
    level: unit
  - path: scripts/smoke-047-zellij-session-snapshot.ts
    level: e2e
created: 2026-05-12
owner: main
depends_on: []
supersedes: null
---

## Intent

Add a durable snapshot registry for Zellij sessions so the Orchestrator can list all running or recently-crashed sessions — especially Claude Code sessions — and safely resume them after a crash. Each snapshot entry records the session name, tab title, current working directory, transcript path, Claude session/resume ID, last prompt/status, and a timestamp. Snapshots are written atomically and a history file is preserved; the registry is updated via an explicit `snapshot` command and automatically from Claude stop/notification hooks. Recovery reads the registry and returns resumable sessions so the Orchestrator can call `claude --resume <id>` without any live process interaction.

## Constraints

- Writes must be atomic: write to a `.tmp` file then rename/overwrite, never truncate-in-place.
- History must be preserved: each snapshot update appends to a rotating history file; no entry is deleted.
- No live process killing under any circumstance.
- All registry files live under `data/snapshots/` within the repo (not `/tmp` or the system temp dir).
- The snapshot module must be pure-functional core (no side effects in the domain types/functions) with an imperative shell for file I/O — matching the FCIS architecture layer.
- No `any` types; no `as` casts outside test files; `strict: true`.
- The `snapshotSession` function must be callable without starting a Zellij session.
- The `listResumable` function filters by status and returns sessions with a non-null `claudeResumeId`.

## Acceptance criteria

- [ ] AC1: `snapshotSession` writes a JSON registry file atomically (tmp-then-rename) to `data/snapshots/registry.json`. The file contains the session record with all required fields: `name`, `tabTitle`, `cwd`, `transcriptPath`, `claudeResumeId`, `lastPrompt`, `status`, `updatedAt`.
- [ ] AC2: A second `snapshotSession` call for the same session name overwrites the registry entry for that session, leaving other entries intact.
- [ ] AC3: Each snapshot write appends a history line to `data/snapshots/history.ndjson` (newline-delimited JSON), preserving all prior history.
- [ ] AC4: `listResumable` returns only sessions whose `status` is `"active"` or `"crashed"` and whose `claudeResumeId` is non-null.
- [ ] AC5: `listResumable` called on an empty or non-existent registry returns an empty array without throwing.
- [ ] AC6: The registry file written by `snapshotSession` is valid JSON parseable by `JSON.parse`.
- [ ] AC7: (e2e) The smoke script runs `snapshotSession` in a real temp directory, then reads back the registry file and verifies field presence, atomicity (tmp file gone), and history line count.

## Context

- Spec 031 (sessions.repo) — existing session open/close/list implementation; snapshot is a separate module colocated in `apps/backend/src/features/sessions/`.
- Claude stop/notification hooks live in `.claude/hooks.ts`; hook-based auto-update is out of scope for this spec (tracked as a follow-up).
- `data/snapshots/` must be `.gitignore`d to prevent committing runtime state.
