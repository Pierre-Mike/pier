# Design — 047: Add Zellij session snapshot registry

## Approach

Introduce a new module `apps/backend/src/features/sessions/snapshot.ts` following the Functional Core / Imperative Shell (FCIS) pattern:

- **Core types** — `SnapshotEntry` (readonly record), `SnapshotRegistry` (readonly map keyed by session name), `SnapshotStatus` union.
- **Pure functions** — `upsertEntry(registry, entry)` merges a new/updated entry into the registry; `filterResumable(registry)` returns entries matching the resumable predicate.
- **Imperative shell** — `snapshotSession(dataDir, entry)` does: read existing registry (or `{}`), call `upsertEntry`, write atomically (tmp then rename), append history line. `listResumable(dataDir)` reads the registry and calls `filterResumable`.

### Atomic write protocol

```
1. Serialise registry to JSON string.
2. Write to <dataDir>/registry.json.tmp
3. fs.rename(<dataDir>/registry.json.tmp, <dataDir>/registry.json)
   (atomic on POSIX; safe on macOS HFS+/APFS)
```

### History file

Each call to `snapshotSession` appends one NDJSON line to `<dataDir>/history.ndjson`:
```json
{"ts": "2026-05-12T00:00:00.000Z", "name": "...", "status": "active", ...}
```

No rotation policy in this spec — history grows unbounded (follow-up spec can cap it).

## Files touched

- `apps/backend/src/features/sessions/snapshot.ts` — new module (core + shell)
- `apps/backend/src/features/sessions/snapshot.test.ts` — gate: unit tests (written RED by spec-tester)
- `scripts/smoke-047-zellij-session-snapshot.ts` — gate: e2e smoke (written RED by spec-tester)
- `data/snapshots/.gitkeep` — ensure directory is tracked; actual runtime files `.gitignore`d
- `.gitignore` — add `data/snapshots/*.json` and `data/snapshots/*.ndjson` entry

## Decisions

- **FCIS layering** — pure core keeps the domain logic unit-testable without filesystem mocking; imperative shell handles all I/O, matching the existing pattern in `sessions.repo.ts`.
- **`data/snapshots/` not `/tmp`** — persistent across reboots; user-visible audit trail; easily `ls`-able by Orchestrator.
- **NDJSON for history** — append-only, streamable, no full parse needed to tail recent entries.
- **No Effect dependency for this module** — the snapshot module is a lightweight utility; using raw `node:fs/promises` keeps it decoupled from the backend's Effect runtime (no `Layer` needed to call it from hooks).
- **Hook-based auto-update out of scope** — this spec delivers the data model and I/O primitives; the hook integration is a separate concern tracked in the intent.

## Risks

- Rename atomicity on network-mounted filesystems (NFS, SMB) — acceptable risk; `data/snapshots/` is always local.
- Concurrent writes from multiple hook firings — POSIX rename is atomic but last-write-wins; for this spec that is acceptable.

## Out of scope

- Hook-based automatic snapshot triggering (`.claude/hooks.ts` integration).
- Session recovery CLI command.
- History rotation / size capping.
- Frontend UI for resumable sessions.
