# Design

## Approach

The `resolveProjectCwd` logic already exists as an unexported async closure inside `makeTerminalSessionsLive`. Extract it to a top-level exported function that accepts `(projectsRoot: string, projectId: string)` explicitly. Update the closure inside `makeTerminalSessionsLive` to delegate to it. Add four tests to `sessions.repo.test.ts`: two direct tests on the exported helper (real tmp dir, no mocks), and two service-surface tests on `open`/`openDefault` with `Bun.spawn` patched to capture the `cwd` option.

## Files touched

- `apps/backend/src/features/sessions/sessions.repo.ts` — export `resolveProjectCwd` as a top-level function; delegate the inner closure to it.
- `apps/backend/src/features/sessions/sessions.repo.test.ts` — add four tests covering AC (1)–(5).

## Decisions

- **Real tmp dir over mocked `stat`** — `Bun.mock.module` for `node:fs/promises` is fragile with ESM; a `mkdtempSync` + `mkdirSync` setup is simpler and more honest about actual fs behaviour.
- **Service-surface tests over private-helper tests** — `resolveProjectCwd` as a closure is unobservable; testing via `open()` / `openDefault()` keeps the contract refactor-friendly. The direct exported-helper tests are a bonus for clarity.
- **Bun.spawn monkey-patch** — the existing test suite does not wire up spawn capture; a `beforeAll` monkey-patch on `Bun.spawn` is the lightest approach that works without ESM mock fragility. `@ts-expect-error` is acceptable in test files (constitution §5 allows `as` casts in tests).
- **One shared `makeLayer` factory** — builds a `makeTerminalSessionsLive` layer backed by an inline `ConfigService` pointing at the tmp dir, avoiding dependency on `ConfigTest`'s hardcoded `/tmp/test-projects`.

## Risks

- `spawnNamedSession` calls `listZellijSessions` (also uses `Bun.spawn`) before the session spawn; the mock must handle both call shapes. The test filters by `args.includes("--session")` to isolate the right call.

## Out of scope

- Spawning behaviour beyond cwd (env vars, terminal size, etc.).
- The zellij web auto-create path.
- Session reconnect / health-check behaviour.
