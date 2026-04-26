---
name: retro
description: >
  The feedback pillar. Retrospective scan of `.claude/traces/`, `specs/archive/`, and merged PRs
  to surface patterns (retry-heavy tasks, hot files, axiom violations, time-to-green, orphaned
  sessions). Output is a fresh spec of kind `writeup` or `rule` under `specs/active/`, authored
  via `/do` — every finding stays on-loop, every proposed improvement is itself a spec. Invoke as
  `/retro` or `/retro --since 7d`.
---

## Core Principle

Retrospective closes the loop. Observability data only matters when it produces action. `/retro` converts aggregated signal into a spec — never a floating report.

## Preconditions

- Current directory is the repo root
- Current branch is `main`, working tree clean
- At least one archived spec or one trace file exists

## Workflow

### Step 1 — Define the window

Default: last 7 days. Respect `--since <duration>` if provided (e.g. `7d`, `30d`, `2026-04-01`).

### Step 1.5 — Preflight: detect dormant worktrees

Run:

```bash
bun scripts/retro-preflight.ts
```

If the output is non-empty, print it verbatim at the top of the retrospective report under the `Dormant in-flight specs:` header **before proceeding to findings**.

Dormant specs block retrospective authorship. If dormant worktrees are found, surface them to the user and stop — do not proceed to Step 5 (author a new spec) until the dormant worktrees are resolved, unless `--force` is passed explicitly.

### Step 2 — Gather signal

Read from four sources:

**Traces** — `.claude/traces/*.jsonl` within the window.
- Count events per session
- Count tool-call failures, blocks (hook exit 2), retries
- Record most-touched file paths
- Flag sessions with >3× median retry count

**Specs archive** — `specs/archive/` modified within the window.
- Time from `created` to `archived`
- Number of commits on the spec branch (via `git log --oneline spec/<slug>`)
- Kind distribution

**Merged PRs** — `gh pr list --state merged --search "merged:>=<window-start>"`.
- Map PR → spec via branch name (`spec/<slug>`)
- Check CI duration, number of re-runs

**Open specs** — `specs/active/` still present; age since creation.
- Specs older than 7 days are candidates for abandonment or escalation.

### Step 3 — Aggregate findings

Produce a structured set of observations. Each finding must have:
- **Signal**: what the data shows
- **Hypothesis**: why it might be happening
- **Proposed action**: one concrete change (hook, rule, axiom, script, template tweak)
- **Kind of proposed spec**: `rule`, `workflow`, `writeup`, or `code`

Minimum viable finding count: 1. Upper bound: 5. If nothing surfaces, say so plainly and exit — never invent findings.

### Step 4 — Pick the top finding

Rank findings by leverage: how much future pain does this prevent? Select one. Bias toward **rules** and **workflows** — those are deterministic enforcements that compound.

### Step 5 — Author the improvement spec

Invoke `/do` with the top finding as the intent. The resulting spec:
- Kind: derived from the finding (typically `rule` or `workflow`)
- Gate: the enforcement artifact (a new biome rule + fixtures, a new hook, a smoke script)
- Tasks: the minimal set to implement the enforcement

If multiple findings are worth acting on, list the remaining ones in the spec's `proposal.md` under a `Deferred findings` section. Do not spawn multiple specs from one `/retro` — one action at a time keeps the loop legible.

### Step 6 — Emit the report alongside

Inside the new spec folder, also write `findings.md` containing all observations (not just the acted-on one). This becomes the spec's audit trail of what was seen at retrospective time.

### Step 7 — Report

Print:

```
/retro complete (window: <window>)

findings: <n>
acted on: <top finding title>
spec authored: /do pipeline in progress → PR <url>

deferred findings in: specs/active/NNN-retro-<date>/findings.md
```

## Rules

- **One action per retrospective.** If everything is urgent, nothing is.
- **Never hand-wave the signal.** Every finding cites specific trace files, spec IDs, or PR numbers.
- **The report is a spec, not a markdown file.** `findings.md` lives inside the spec folder, not loose at repo root.
- **Never auto-merge the resulting PR.** The human closes the feedback loop by merging.

## When NOT to invoke

- Less than 3 sessions of history — not enough signal
- Mid-execution of another spec — finish first
- `--since` window contains no traces AND no archived specs — output "no activity, no retrospective" and exit

## Automation hook

`/retro` is intended to be run on a cron (GitHub Action, weekly). When invoked headlessly:
- Non-interactive mode: always pick the top finding, no prompts
- Commit the spec with a `[retro]` tag
- Open the PR with label `retro`

## Escalation

If findings are contradictory (one action would violate another's recommendation), write `specs/active/NNN-retro-<date>/conflict.md` describing the conflict and stop. Humans resolve.

## Why `retro` (not `review`)

`review` collides with PR-review semantics. This skill does retrospective — a look-back at past work to propose improvements — and its output lives on the same spec rails as everything else in the repo.
