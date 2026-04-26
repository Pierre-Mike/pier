---
name: do
description: >
  End-to-end spec → worktree → work → close → push → PR. The only command needed to produce a
  change in this repository. Runs alignment via the `align` skill, authors a spec under
  `specs/active/NNN-slug/` with the gate RED, iterates edits against the gate, closes with
  `spec:complete`, pushes the spec branch, opens a PR. Never touches main directly. Invoke as
  `/do <intent>`.
---

## Core Principle

One command per change. Main stays clean. Work happens in an isolated worktree on its own branch; the PR is the integration point.

## Preconditions

- Current directory is the repo root
- Current branch is `main`
- Working tree is clean (`git status --porcelain` empty)

Refuse with a clear message if any precondition fails.

## Workflow

### Step 1 — Align

Invoke `align`. Let it interview the user through its four layers (Goal → Big Picture → Details → Decisions).

**Override terminal behaviour**: when `align` reaches confirmation at the Decisions layer, do NOT let it begin implementation. Capture the confirmed plan and proceed to Step 2.

### Step 2 — Extract spec fields

From the aligned plan derive:

- `title` — sentence-case goal
- `kind` — one of `code`, `rule`, `workflow`, `writeup`
- `gate` — file path(s) proving doneness
- `depends_on` — archived spec IDs this builds on (must exist in `specs/archive/`)

Confirm these four fields with the user in a single compact message. If any are unclear, ask — do not guess.

After the user confirms, do NOT continue inline. Hand off Steps 3–10 to a background subagent.

### Step 2.5 — Dual-agent TDD dispatch

The rest of `/do` runs as three serial subagent roles, orchestrated by the main session. The separation between test-author, test-judge, and implementer closes the self-collusion window where a single agent writes both the tests and the code that passes them (research: AgentCoder arxiv 2312.13010, Code-A1 arxiv 2603.15611 — measured 8–11pp pass@1 improvement from role separation). Main session holds state on the filesystem (commits + sentinel files) — no orchestrator subagent needed.

**Role summary**:

| Role | Agent | Model | Reads | Writes | Exits on |
|---|---|---|---|---|---|
| spec-tester | `spec-tester` | sonnet | proposal/design/tasks + tester-review.md (retry) | spec folder + gate files | RED commit |
| spec-judge | `spec-judge` | opus | proposal.md + gate files ONLY | tester-review.md, .gate-frozen (PASS) | verdict written |
| spec-implementer | `spec-implementer` | sonnet | proposal + design + frozen gate + review | everything except gate paths | Step 10 report |

**Dispatch chain** (by kind):

```
code                              →  tester → judge (retry cap 3) → implementer
rule | workflow | writeup         →  tester → implementer  (skip judge, skip .gate-frozen)
```

The self-collusion gate matters only when a single agent writes BOTH the test and the production code that passes it — i.e. `kind: code`. For `rule` (lint rule + fixture), `workflow` (smoke script), and `writeup` (markdown sections), the gate is a fixture/script/section-shape check; test-implementation coupling is minimal, so the judge would add subagent token cost for near-zero safety gain.

**Main-session pseudocode**:

```
const spec_dir = `specs/active/${id}-${slug}`

if kind !== "code":
  dispatch spec-tester with aligned-plan handoff
  await completion
  dispatch spec-implementer
  await completion
  return  // no judge for rule/workflow/writeup; the fixture/script/prose IS the deliverable

attempt = 1
review_brief = null
while attempt <= 3:
  dispatch spec-tester (attempt, review_brief)
  await completion
  dispatch spec-judge (attempt)
  await completion
  if exists(`${spec_dir}/.gate-frozen`):
    break  // judge passed
  review_brief = read(`${spec_dir}/tester-review.md`)
  attempt += 1

if not exists(`${spec_dir}/.gate-frozen`):
  // judge rejected all 3 tester attempts. tester-review.md has the
  // ESCALATION header prepended. Fall through to Step 8 with --draft
  // so the human reviews tester-review.md inside a normal PR view.
  judge_rejected = true
else:
  judge_rejected = false
  dispatch spec-implementer
  await completion  // implementer prints Step 10 report itself
```

**Dispatch mechanics**: each role is a subagent defined in `.claude/agents/<name>.md`. Invoke via:

```
Agent({
  subagent_type: "spec-tester" | "spec-judge" | "spec-implementer",
  run_in_background: true,
  description: "do/<slug>: <role>",
  prompt: <self-contained handoff — aligned plan + worktree path + current attempt + review brief if any>,
})
```

The handoff prompt for each dispatch must be fully self-contained — the subagent has no prior context:

- **Spec fields** — `title`, `kind`, `gate`, `depends_on` (from Step 2)
- **Aligned plan** — copy-paste the confirmed Goal + Big Picture + Straightforward Details + Non-obvious Decisions text from the align interview, verbatim. Do not summarise.
- **Worktree path** — absolute path to `.agentic/worktrees/<slug>`
- **For spec-tester retries** — include the current `tester-review.md` as a revision brief
- **For spec-implementer** — note that the gate is frozen; the hook will enforce
- **Termination** — "exit after <role-specific exit condition>. Do not `git pull`. Do not touch `main`."

After the main session's orchestration loop ends, the final subagent's exit notification lands in the transcript. The main session prints the Step 10 report based on the status observed (complete / paused). Relay the report to the user verbatim.

The steps below are executed by the subagents. Step 5 lives in spec-tester; Step 6 lives in spec-implementer.

### Step 3 — Allocate ID and slug

- Scan `specs/active/` and `specs/archive/`
- Next `NNN` = max existing ID + 1, zero-padded
- `slug` = kebab-case of the title, ≤ 5 words

### Step 4 — Open worktree

```bash
bun scripts/worktree-open.ts <slug>
```

Script creates `.agentic/worktrees/<slug>/` on branch `spec/<slug>` from `main`. All subsequent edits use absolute paths under that directory.

### Step 5 — Author the spec (RED)

Inside the worktree, write in this order. `proposal.md` comes first because the pre-tool-use write guard only allows edits to protected paths (`apps/backend/wrangler.toml`, gate paths once frozen) once an active spec targets them.

**5a. `proposal.md`** — based on `specs/_template/proposal.md`. Fill frontmatter (id, title, status=active, kind, gate, created, owner=main, depends_on, supersedes=null). Body: Intent, Constraints, Acceptance criteria (as `- [ ]`), Context.

**5b. Gate artifact (RED)** — failing test file / empty writeup / not-yet-implemented rule / exit-1 smoke. See `specs/constitution.md` §4 for per-kind details.

**5c. `design.md`** — Approach, Files touched, Decisions, Out of scope. Skip empty sections.

**5d. `tasks.md`** — ordered, typed. Each task declares `agent: main`, `depends: []`, `file_targets: [...]`, `boundary: [...]`. Mark `[P]` on parallel-safe siblings.

Validate inside the worktree:
```bash
cd .agentic/worktrees/<slug>
bun run spec:lint
bun run tasks:verify   # expected to fail — RED is correct
```

Commit the RED state on the spec branch:
```bash
git add -A
git commit -m "spec(<id>): RED — <title>"
```

### Step 6 — Work the spec

Loop, inside the worktree:

```
while tasks remain unchecked:
  pick the next ready task (depends satisfied)
  edit each file in file_targets (non-deterministic step)
  run: bun run tasks:verify
  if green → next task
  else → inspect output, adjust, re-edit
  if stuck after 3 attempts → escalate per spec-implementer.md (stop)
```

Edit only files listed in the current task's `file_targets`. Respect `specs/constitution.md` — no `any`, no `as` outside tests, colocated tests, FCIS layering, protected paths.

Do not tick `- [x]` yourself. `spec-complete` does that from git truth.

### Step 7 — Close the spec

When every task's `file_targets` are modified AND `bun run tasks:verify` is green:

```bash
bun run spec:complete <slug>
```

`<slug>` accepts either the full directory name (`002-evals-importance`) or a bare slug (`evals-importance`). Bare slugs resolve by suffix-match; ambiguous matches error out.

The script:
- Re-verifies the gate
- Ticks tasks whose `file_targets` were modified in git
- Archives the spec folder
- Commits with a conventional message

### Step 8 — Push + PR + auto-merge

```bash
git push -u origin spec/<slug>
```

**Branch A — implementer completed (normal path)**:

```bash
PR_URL=$(gh pr create --title "<kind>(<id>): <title>" --body "$(cat <<'EOF'
## Summary
<one sentence of intent from proposal.md>

## Spec
- kind: <kind>
- gate: <path>
- archived to: specs/archive/YYYY-MM-DD-<slug>/

## Changes
<short bullet list derived from tasks.md>
EOF
)")

# Queue the merge — fires automatically once CI is green.
# `gh pr merge --auto` exits silently on success; echo so the caller sees it was dispatched.
gh pr merge --auto --squash --delete-branch "$PR_URL"
echo "✓ auto-merge queued for $PR_URL"
```

**Branch B — judge rejected 3 tester attempts (draft PR for review)**:

```bash
PR_URL=$(gh pr create --draft --title "<kind>(<id>): <title> [JUDGE-REJECTED]" --body "$(cat <<'EOF'
## Summary
Judge-rejected escalation: spec-judge rejected 3 tester attempts. No implementer ran. This draft PR is opened so the human can review `specs/active/<slug>/tester-review.md` (ESCALATION header at top) in a normal diff view with inline comments.

## Spec
- kind: <kind>
- gate: <path>
- status: RED — gate never reached GREEN because the judge rejected the tests

## Resume paths
1. Clarify intent in proposal.md and push — retry counter resets.
2. Override the judge — manually touch `.gate-frozen` and push; a future /do resume dispatches the implementer.
3. Abandon — close the PR and run `bun scripts/worktree-close.ts <slug>`.
EOF
)")
echo "✓ draft PR opened for judge-rejected spec: $PR_URL"
# Do NOT queue auto-merge for draft PRs.
```

If auto-merge is not enabled on the repo (branch A only), `gh pr merge --auto` fails with a clear error. In that case: print the PR URL and skip to Step 10 with a note that auto-merge is unavailable. Do not attempt to merge directly.

### Step 9 — Watch CI

Return to the main repo working directory (not the worktree). Then:

```bash
gh pr checks "$PR_URL" --watch --interval 15 --required
```

This blocks until all required CI checks resolve. On success → auto-merge fires → branch deleted on remote.

On failure → invoke the CI feedback script so a brief lands inside the worktree for the next session to pick up:

```bash
bun scripts/ci-feedback.ts "$PR_URL" --worktree .agentic/worktrees/<slug>
```

The script fetches `gh pr checks` + `gh run view --log-failed` for every red job and writes `ci-failure.md` next to `proposal.md` inside the spec's active directory. A follow-up session (human or a future autonomous fix subagent) reads that brief and drives the fix. No LLM is invoked by this script — it is pure `gh` + markdown formatting.

### Step 10 — Report

After the dispatch chain resolves, print one of two variants:

**On CI green + auto-merged**:
```
/do complete for <id>:
  branch: spec/<slug>  ← merged + deleted on remote
  PR: <url>  ← merged
  CI: passed (<n> checks)

main is ahead of your local. Run:
  git pull
The post-merge hook will auto-clean the local worktree.
```

**On CI red OR judge rejected 3 tester attempts**:
```
/do paused for <id>:
  branch: spec/<slug>
  PR: <url>  ← open, awaiting fix
  CI: FAILED | (draft — judge rejected)

failing checks:
  - <name>: <url>
  - <name>: <url>

CI failure brief: .agentic/worktrees/<slug>/specs/active/<slug>/ci-failure.md

main is unchanged. Investigate the brief, push fixes to spec/<slug>, or close the PR.
If the judge rejected 3 tester attempts, see `tester-review.md` inside the spec folder for the revision brief.
```

Stop after printing the report. Do not pull, do not clean up the worktree — those happen on the user's next `git pull` (post-merge hook runs `sync` automatically).

## Rules

- **Main is never dirty.** Every file write goes into the worktree. Verify with `git status` from main after /do finishes.
- **Align is non-optional.** Skipping the interview produces misaligned specs that poison the archive.
- **Delegate after alignment.** Once spec fields are confirmed, the main session must dispatch Steps 3–10 to a background subagent via the `Agent` tool (`run_in_background: true`). The user stays unblocked; re-engagement happens through the subagent's completion notification.
- **Spec first, gate second.** `proposal.md` gets written before any gate artifact — the pre-tool-use write guard blocks edits to protected paths until an active spec targets them.
- **Never tick manually.** `spec-complete` does it from git truth.
- **Never merge directly.** Use `gh pr merge --auto` to queue. CI gates the actual merge.
- **Never close the worktree manually inside `/do`.** The post-merge hook handles cleanup on `git pull`.
- **Never `git pull` from within `/do`.** Leave that as the user's deliberate next action — they may want to keep working on parallel specs first.
- **Deterministic-first.** If the user's intent can be a lint/hook/script, prefer `kind: rule` or `kind: workflow`.

## Parallelism

To run multiple `/do` in parallel: dispatch each via the `Agent` tool in a single message. Each subagent runs `/do` in isolation, each opens its own worktree, each opens its own PR. No file conflicts are possible until PR merge time.

## When NOT to invoke

- Question rather than change request → answer, skip.
- Trivial typo in a non-protected file → commit directly on main.
- An active spec already exists matching this intent → `cd` into its worktree and resume.

## Escalation

Judge-rejection escalation (3-strike FAIL on spec-tester) is folded into the Step 10 `paused` variant: the judge writes an `## ESCALATION — 3 attempts exhausted` header at the top of `tester-review.md`, and Step 8 opens a draft PR so the human reviews it in a normal PR view.

Implementer-side escalation (stuck after 3 `tasks:verify` failures or a required edit breaches an axiom) is covered in `.claude/agents/spec-implementer.md` — it writes its own sidecar artifact and stops, leaving the worktree + branch intact for human inspection. No PR is opened in that case.

Alignment escalation (cannot converge after three iterations on the same layer) is owned by the `align` skill itself — surface the ambiguity back to the user and stop before Step 2.
