# pier — UI Harness for Local and Remote Agent Sessions

## What is this?

`pier` is an experimental web UI harness for agentic coding sessions. It takes inspiration from `pi`: the terminal remains the source of truth for agent work, but the surrounding harness can provide richer documentation, visibility, controls, and UI experiments.

The goal is not to replace the CLI. The goal is to make CLI-driven agents easier to observe, steer, and extend through a browser-based workspace that can sit beside the terminal locally or be accessed remotely.

## Problem Statement

Agentic coding tools are powerful, but their default interface is often too narrow:

- Important session context is spread across terminals, JSONL logs, generated artifacts, git state, and editor windows.
- Running multiple agents or sessions makes it hard to see what is active, what changed, and where attention is needed.
- UI experimentation around agents is difficult because most harnesses are terminal-first and not designed to expose state to a richer interface.
- Remote access is awkward: a session may be running on one machine, while the human wants to monitor or interact with it from another.
- Generated artifacts, pop-ups, notifications, review surfaces, and session dashboards need a place to live outside the terminal.

`pier` exists to turn the agent harness into an observable, extensible, UI-first control plane while preserving the CLI tools that make the workflow powerful.

## Solution

Build a local-first dashboard for `pi`, Claude Code, `zellij`, GitHub CLI, Bun tooling, and repository artifacts.

The dashboard provides:

- A project picker for zellij-managed repositories.
- Embedded terminal sessions through zellij's web server and pier's proxy layer.
- Live Claude/pi activity streams from session logs.
- Artifact browsing for generated files, drops, reports, previews, and outputs.
- A foundation for richer harness UI: modals, pop-ups, agent status cards, review panels, websocket-driven interactions, and remote session views.

The product should make the harness feel programmable: agents can create useful state, the backend can stream it, and the frontend can present it in whatever UI pattern is most helpful.

## Product Vision

`pier` should become the browser surface for agentic development harnesses.

A user should be able to start or attach to a coding session, watch what agents are doing, inspect their artifacts, interact with terminals, and eventually trigger actions from custom UI components. The UI should be flexible enough to support experiments: status overlays, notifications, diffs, preview panes, approval dialogs, agent timelines, GitHub issue/PR panels, and documentation-driven help surfaces.

This repository is therefore both:

1. A working dashboard for local agent sessions.
2. A platform for experimenting with better human-agent interfaces.

## Primary Users

- Solo developers running agentic coding workflows.
- Harness builders experimenting with new UX around CLI agents.
- Developers who want to monitor local or remote sessions from a browser.
- Users who prefer a visual control plane but still want the power of terminal tools.

## Core Principles

### 1. CLI first, UI enhanced

`pier` does not hide or replace the CLI. It embeds and augments terminal workflows built on `zellij`, `pi`, Claude Code, GitHub CLI, and Bun.

### 2. Harness state should be visible

Events, artifacts, projects, sessions, errors, and generated outputs should be exposed through typed APIs and streamed to the UI instead of staying buried in logs.

### 3. UI experimentation should be cheap

The architecture should make it easy to add new panels, modals, pop-ups, websocket features, preview surfaces, and agent interaction patterns without rewriting the core harness.

### 4. Local-first, remote-capable

The first target is a local dashboard. The long-term direction is remote session access: a user can run agents on one machine and observe or interact with them from another.

### 5. Strong boundaries, typed contracts

The backend keeps a functional core / imperative shell split, uses Effect services for external systems, and exports typed Hono contracts to the frontend. UI experiments should not require unsafe API drift.

## Current Capabilities

- Local Astro dashboard.
- Bun + Hono backend.
- Typed frontend/backend API contract through Hono RPC.
- Project discovery from a configured projects root.
- Zellij session creation and iframe embedding.
- Zellij reverse proxy and websocket bridge.
- Session registry for opened terminals.
- Live server-sent event streams for agent activity and artifacts.
- Claude/pi JSONL event adaptation into UI-friendly events.
- Artifact discovery and file viewing.
- Logs modal with history, filtering, and live updates.
- BPE-style spec workflow for changes to the repository itself.

## User Stories

1. As a developer, I want to open a browser dashboard for my agent sessions, so that I can see the whole harness at once.
2. As a developer, I want to select a project, so that I can attach to the correct repository quickly.
3. As a developer, I want a terminal embedded in the page, so that I can use the CLI without leaving the dashboard.
4. As a developer, I want zellij sessions to survive browser reloads, so that I do not lose work.
5. As a developer, I want to see live agent events, so that I know what the agent is doing.
6. As a developer, I want to inspect generated artifacts, so that outputs are not hidden in the filesystem.
7. As a developer, I want logs filtered by project and session, so that multi-agent work stays understandable.
8. As a harness builder, I want typed APIs from backend to frontend, so that UI experiments remain safe.
9. As a harness builder, I want websocket/SSE primitives, so that the UI can update live.
10. As a remote user, I want to access an existing session from another machine, so that I can monitor long-running work away from the host.
11. As a reviewer, I want future UI panels for diffs, tests, issues, and PRs, so that I can approve agent work faster.
12. As an agent workflow designer, I want documentation and visible conventions inside the repo, so that agents can understand how to extend the harness correctly.

## Implementation Direction

The repository should continue to evolve around these modules:

- Backend shell routes for projects, sessions, artifacts, event streams, config, and zellij proxying.
- Effect-based infra services for filesystem access, zellij, event watching, artifact watching, and streaming buses.
- Pure core modules for event adaptation, artifact classification, versioning, and boundary rules.
- Astro frontend components for the dashboard shell.
- Vanilla TypeScript dashboard modules for state, rendering, SSE subscriptions, logs, files, project selection, terminal behavior, and UI interactions.
- Typed API contract package derived from the backend `AppType`.
- Spec-driven repository workflow for safe, test-first changes.

## Future Product Opportunities

- Remote-safe authentication and authorization for shared sessions.
- GitHub issue and PR panels powered by `gh`.
- Test/build status surfaces powered by Bun and Turbo output.
- Agent timeline views grouped by session, tool call, and artifact.
- Approval dialogs for risky actions.
- Notification pop-ups for errors, blocked tasks, completed runs, or requested human input.
- Custom agent widgets that can be generated by the harness.
- Live preview panes for web apps, markdown, diagrams, canvases, and reports.
- Multi-agent orchestration views showing who is working on what.
- Better documentation surfaces that explain current harness conventions to both humans and agents.

## Out of Scope for Now

- Replacing terminal workflows entirely.
- Building a full IDE.
- Supporting every terminal multiplexer.
- Committing to a single final UI pattern before experimentation.
- Making remote access public without a security model.

## Success Criteria

- A user can choose a project, open a zellij-backed terminal, and observe agent activity in one browser page.
- Agent-generated files and logs are easy to discover and inspect.
- The UI can be extended with new panels or interactions without breaking backend contracts.
- Remote-session support becomes possible without changing the core product model.
- The repository documentation accurately explains that `pier` is a UI harness for agentic development, not a generic TypeScript template.
