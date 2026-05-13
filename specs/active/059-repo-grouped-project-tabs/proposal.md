---
id: 059-repo-grouped-project-tabs
title: Add repo-grouped project tabs with agent view
status: active
kind: code
gate:
  - path: apps/frontend/src/dashboard/projects.test.ts
    level: unit
  - path: apps/frontend/src/components/projects.integration.test.ts
    level: integration
created: 2026-05-13
owner: main
depends_on: ["057-wire-agent-view-mount", "058-fix-agents-schema-drift"]
supersedes: null
---

## Intent

Replace the fullscreen agent-view panel (currently a `<section id="agent-view-root">` outside the sidebar) with a tab-switcher at the top of the sidebar. Two tabs — "Projects" and "Active Agents" — let the user switch between the project list and the agent view without losing screen real-estate. Projects in the "Projects" tab are grouped by their parent directory (repo folder) rather than displayed as a flat or status-grouped list.

## Constraints

- Exactly two tabs: "Projects" and "Active Agents" — no additional tabs.
- Tab state is UI-only — no server round-trip, no localStorage persistence.
- The agent-view container is hidden (not unmounted) when "Projects" is active — SSE connection stays alive.
- CSS for tabs and group headers goes in `src/styles/dashboard.css`, not in Astro `<style>` blocks (runtime-built nodes miss Astro scope hash).
- No new npm/bun dependencies.
- All existing regression tests for specs 021–037 must remain passing after implementation.
- Grouping key is `project.path`'s parent directory (`path.split("/").slice(0,-1).join("/")`).

## Acceptance criteria

- [ ] AC 1: `renderProjects` groups project rows by parent directory — projects with the same parent dir appear under a shared group header element (with class `proj-group-header`), and projects in different parent dirs are in separate groups.
- [ ] AC 2: The sidebar contains a tab switcher with exactly two tabs labelled "Projects" and "Active Agents". Clicking a tab shows only that tab's content; the other is hidden.
- [ ] AC 3: When "Projects" tab is active, the grouped project list is visible and the agent-view container is hidden (has `hidden` class or `display:none`).
- [ ] AC 4: When "Active Agents" tab is active, the agent-view container is visible inside the sidebar and the project list area is hidden.
- [ ] AC 5: `filteredProjects()` filter-by-name still works within grouped rendering — projects not matching the filter do not appear, and groups with zero matches are absent.
- [ ] AC 6: The `session-alive-dot` behavior is preserved on project rows in the "Projects" tab (regression guard for specs 035–037).
- [ ] AC 7: The "Active Agents" tab label reflects the number of running agents (e.g., "Active Agents (3)" when 3 agents are running, "Active Agents" when zero).

## Context

- Spec 057 (`wire-agent-view-mount`): wired `mountAgentView` into the dashboard `init()` function and placed `#agent-view-root` outside the sidebar.
- Spec 058 (`fix-agents-schema-drift`): fixed the agent roster decode so `agentRows` is always populated correctly.
- Memory: Astro `<style>` blocks don't reach runtime-built DOM — CSS must go in `src/styles/dashboard.css`.
- Memory: deduplicate related items — branch+worktree sharing a name should merge into one row.
