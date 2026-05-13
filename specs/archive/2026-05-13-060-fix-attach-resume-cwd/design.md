# Design

## Approach

Thread `sessionId` from state.json through the backend `AgentRow` type and into the frontend Attach handler, then replace `claude attach <shortId>` with `claude --resume <sessionId>` in the `pier:zellij-launch` event.

The `sessionId` is already present in every `state.json` file (confirmed in fixtures). The change is purely additive: a new field on `AgentRow` in two places (backend core + frontend), and a changed command string in one handler.

## Files touched

- `apps/backend/src/features/agents/agents.adapt.core.ts` — add `sessionId: string` to `AgentRow`, extract it in `stateToAgentRow`
- `apps/frontend/src/dashboard/agent-view.ts` — add `sessionId: string` to local `AgentRow`, update `attachAgent` to use `claude --resume <sessionId>` with `cwd`, update Attach button click handler to pass `row.sessionId` and `row.cwd`

## Decisions

- **Source of sessionId**: state.json already has `sessionId` for every running agent. Use state.json as the source (consistent with how `cwd`, `cliVersion`, etc. are sourced). The roster also has `sessionId` but it is not currently threaded to `stateToAgentRow`; using state.json avoids touching `buildRowsFromRoster`.
- **Default value for missing sessionId**: empty string `""` — same pattern as `cwd` and `cliVersion` in the existing `stateToAgentRow` implementation. A missing sessionId means resume won't work; that's acceptable (the session is stale/missing from disk).
- **`pier:zellij-launch` detail shape**: add `cwd` alongside `command`. The existing listener in the zellij panel must already handle a `cwd` property or be updated to do so. The e2e check only validates the shape at source level; the zellij listener integration is assumed functional from spec 056.
- **No route changes**: `AgentRow` is serialized as-is from `agents.routes.ts`. Adding `sessionId` to the type is backward-compatible (additive field, no existing consumers break).
- **No new dependencies**: pure TypeScript field additions.

## Risks

- The zellij panel listener must read `detail.cwd` and pass it as the pane's working directory. If the listener ignores `cwd`, the resume command runs in the wrong directory. This spec only enforces that the field is dispatched — the listener integration must be verified manually or in a follow-up spec.

## Out of scope

- Updating the zellij panel listener to honour `detail.cwd` (separate concern; that listener lives outside `agent-view.ts`)
- Updating `agents.daemon.repo.ts` `buildRowsFromRoster` to pass roster's `sessionId` (state.json's `sessionId` is sufficient)
- Migrating the integration test type contract in `agents.routes.integration.test.ts` (that file's `AgentRow` definition does not include `sessionId`; it will need updating but it is not a gate file for this spec)
