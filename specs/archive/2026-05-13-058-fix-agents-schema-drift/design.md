## Approach

Three-file change targeting the agents feature only. No new endpoints, no frontend changes.

### 1. `agents.schema.ts` — widen `WorkerEntrySchema`

Remove `dispatch: Schema.String`, `seed: Schema.String`, `rendezvousSock: Schema.String`, `ptySock: Schema.String`, `agent: Schema.String`, `isolation: Schema.String` (none of these are consumed by the slice). Replace with `Schema.optional(Schema.Unknown)` for `dispatch` and any other non-consumed fields. Keep strict types for `pid`, `sessionId`, `cwd`, `cliVersion`.

Effect Schema structs are non-strict by default (extra top-level fields are tolerated without declaration). The `seed` field does not appear at the worker top level in the real roster — it lives nested inside `dispatch`. Remove it from `WorkerEntrySchema` entirely.

### 2. `__fixtures__/roster.fixture.json` — re-author from real shape

Replace the current fixture (which uses string `dispatch`/`seed`) with one matching the real roster shape captured from `~/.claude/daemon/roster.json`. Sanitize: two workers max, `pid` redacted to `99999`/`99998`, `sessionId` to `aaaaaaaa-0000-0000-0000-000000000001`/`...0002`, `rendezvousSock`/`ptySock` to placeholder paths. Keep `cliVersion: "2.1.140"` real.

### 3. `agents.daemon.repo.ts` — split decode-failure tag

Current line 103: `if (decoded._tag === "Left") return { _tag: "DaemonAbsent" as const };`

Change to: `if (decoded._tag === "Left") return { _tag: "DaemonRosterUnreadable" as const, details: formatErrorSync(decoded.left) };`

Update `listAgents` return type in the service interface to include `{ _tag: "DaemonRosterUnreadable"; details: string }`.

### 4. `agents.routes.ts` — map new tag to 502

In `listAgentsHandler`, add branch after the `DaemonAbsent` check:
```
if (!Array.isArray(result) && result._tag === "DaemonRosterUnreadable") {
  return c.json({ error: "roster shape unrecognized — check CLI version", details: result.details }, 502);
}
```

## Files touched

- `apps/backend/src/features/agents/agents.schema.ts`
- `apps/backend/src/features/agents/__fixtures__/roster.fixture.json`
- `apps/backend/src/features/agents/agents.daemon.repo.ts`
- `apps/backend/src/features/agents/agents.routes.ts`

## Decisions

- `Schema.optional(Schema.Unknown)` for `dispatch` — sufficient because the routes layer never reads into dispatch fields.
- `formatErrorSync` from `effect` — produces a human-readable string from a `ParseError` without needing an Effect runtime; consistent with `decodeRoster` being synchronous.
- Do NOT declare `agent`/`isolation` as strict fields — they're not consumed and their absence from the strict set reduces future breakage surface.
- `DaemonRosterUnreadable` not `DecodeError` — keeps naming consistent with the `DaemonAbsent` pattern already in the codebase.

## Out of scope

- Frontend changes
- Daemon-write logic, new endpoints
- Strict typing for `dispatch.launch`, `dispatch.seed`, etc.
- Spec 056 / 057 (archived, immutable)
