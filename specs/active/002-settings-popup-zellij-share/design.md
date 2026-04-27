# Design

## Approach

Two sequential slices:

1. **Infra** — add `getZellijReadOnlyToken()` to `apps/backend/src/infra/zellij-auth.ts`. Mirrors `getZellijToken()` exactly: module-local cache, single in-flight mint via `zellij web --create-read-only-token`, disk persistence at `~/.config/pier/zellij-readonly-token` (mode 0600). Separate cache variables and separate disk path prevent any interaction with the read-write token.

2. **Route + UI** — add `GET /settings/zellij-readonly` in a new `apps/backend/src/shell/routes/settings.ts`, wired into `AppType` in `api.ts`. Returns `{ url, tokenName }` where `url` is the zellij web origin + `#token=<readonly-token>` (hash fragment, never logged). Falls back to `PIGUY_ZELLIJ_URL` env. Frontend gains a second FAB at `right: 56px, bottom: 14px` that opens a modal with Share + About tabs.

## Files touched

- `apps/backend/src/infra/zellij-auth.ts` — add `getZellijReadOnlyToken()`, `__resetZellijReadOnlyForTests()`, and `READONLY_TOKEN_PATH` export (test access)
- `apps/backend/src/infra/zellij-auth.test.ts` — Slice 1 gate: unit tests for all read-only token acceptance criteria
- `apps/backend/src/shell/routes/settings.ts` — new route module; exports `settingsRoute` satisfying `RouteModule`
- `apps/backend/src/shell/routes/settings.test.ts` — Slice 2 gate: unit tests for route shape, URL fragment, env fallback, `AppType` compile assertion, `localhostGuard`
- `apps/backend/src/shell/api.ts` — mount `settingsRoute.app` into `routedApp` chain so `AppType` carries the type
- `apps/frontend/src/dashboard/settings.ts` — FAB mount + modal open/close wiring
- `apps/frontend/src/dashboard/SettingsModal.astro` — modal markup: two tabs (Share, About), Copy button, Regenerate button

## Decisions

- **Hash fragment for token** — `#token=<value>` keeps the token out of server access logs and network request URLs. No proxy changes required. Rejected: query param (logged), custom header (requires custom JS in zellij web).
- **Independent FABs** — second FAB at `right: 56px, bottom: 14px`; logs FAB unchanged at `right: 14px`. Rejected: shared row container (couples two independently-owned components).
- **Separate cache variables for read-only token** — `cachedReadOnlyToken` and `inflightReadOnlyMint` are module-level vars distinct from `cachedToken`/`inflightLogin`. Mirrors existing pattern; no shared state risk.
- **No `__resetZellijAuthForTests` reuse** — read-only reset is its own export so tests can reset independently without touching read-write state.

## Out of scope

- Remote reachability — URL is loopback-only; tunnelling is the user's responsibility.
- Token rotation endpoint (`POST /settings/zellij-readonly/rotate`) — future spec.
- About tab read-write URL live-refresh — static on open is sufficient.
