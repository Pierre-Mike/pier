# pier

Local dashboard for Claude Code (`pi`) + `zellij` — three-pane workspace showing projects, terminals, and artifacts.

## What is this?

A web UI that integrates:
- **Project picker** — your zellij-managed repos
- **Terminal embedding** — zellij's web server (`:3000/terminal/:session`)
- **Artifact viewer** — files from `.drops/` and repo tracked files
- **Claude activity** — live event stream for tool calls, agents, and errors across all sessions

## Run

```sh
bun install
bun --filter @pier/backend dev    # :5273 + sandbox :5275
bun --filter @pier/frontend dev   # :5274 — open in browser
```

## Architecture

Monorepo with BPE-style core/infra/shell layout:

```
apps/
├── backend/              # Bun + Hono + Effect-TS
│   └── src/backend/
│       ├── core/         # Pure business logic
│       ├── infra/        # External services (fs, zellij, pi)
│       └── shell/        # Hono routes + SSE
├── frontend/             # Astro
│   └── src/
│       ├── dashboard/    # Vanilla JS modules (reactive store, projects, files, logs)
│       ├── components/   # Astro components
│       └── styles/       # CSS
packages/
└── api-contract/         # Typed RPC client (Hono RPC)
```

**Type safety:** Backend exports `AppType`, frontend imports `hc<AppType>()` — zero codegen.

**Logs modal:** SSE from `/api/stream/events` + history fetch from `/api/logs`. Backend classifies events by `category` field (RFC #3).

**AGENTS.md:** Full harness rules + architecture docs.
