---
id: 008-fix-drop-empty-body
title: Fix drag-drop upload empty multipart body
status: archived
kind: code
gate:
  - path: apps/frontend/src/dashboard/drop.test.ts
    level: unit
  - path: scripts/smoke-drop-form.ts
    level: e2e
created: 2026-04-28T00:00:00.000Z
owner: main
depends_on:
  - 007-drop-injects-terminal-path
supersedes: null
archived: '2026-04-28'
---

## Intent

Drag-and-drop file uploads currently ship an empty multipart body to the backend. Hono's `hc` client serialises `form:` by calling `Object.entries()` on the value — `FormData` instances have no enumerable own keys, so the body arrives empty and no files are saved or injected. Fix: pass `form: { files }` (a plain object whose `files` key holds the `File[]` array) so `hc` iterates it correctly and appends each file under the `files` key.

## Constraints

- Frontend-only change: one edit in `handleOSFileDrop` in `apps/frontend/src/dashboard/drop.ts`.
- Gate must be runtime, not source-inspection. It must drive `wireTerminalDrop()` via a real synthetic `drop` event and verify the captured `Request` body contains ≥1 file.
- Spec 007's six source-inspection tests must remain untouched.
- No backend changes required.
- One new devDependency: `happy-dom` (added to `apps/frontend/package.json`) for the DOM test environment.

## Acceptance criteria

- [ ] AC1: A synthetic `drop` event carrying one `File` results in a `Request` whose `formData().getAll("files").length === 1`.
- [ ] AC2: The captured entry's `.name` matches the original `File.name`.
- [ ] AC3: The existing 6 source-inspection tests from spec 007 continue to pass after the fix.

## Context

Spec 007 (`007-drop-injects-terminal-path`) established the toast/clipboard branching contract via source-inspection tests. Those tests passed because they inspected strings in `drop.ts` directly. The actual multipart serialisation bug was only discoverable via a runtime test that executes the `hc` client's `Object.entries(form)` path. This spec adds that runtime gate.
