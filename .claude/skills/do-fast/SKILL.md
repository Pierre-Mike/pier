---
name: do-fast
description: >
  Like `/do` but skips the align interview. Intent string → `spec-fielder` subagent derives
  `{id, title, slug, kind, gate, depends_on}` → user confirms once → `do-fast-orchestrator`
  subagent runs the rest of the pipeline (worktree open → tester → judge → implementer → PR
  → CI watch → report). Main session is unblocked the moment the orchestrator dispatches.
  Invoke as `/do-fast <intent>`.
---

## Core Principle

Same as `/do`: one command per change, main stays clean, work happens in an isolated worktree.

The difference from `/do`: align is skipped. The 4-layer interview is replaced by a single field-confirm prompt. Use `/do-fast` when you already know the shape of the change. Use `/do` when you don't — align is what catches misalignment, and burning the tester→judge→implementer chain on a wrong intent costs more than the interview.

## Preconditions

- Current directory is the repo root.

Same as `/do`: local `main` state is ignored — `worktree-open.ts` bases the new worktree on `origin/main`.

Refuse only if the repo-root precondition fails.

## Workflow

### Step 1 — Derive fields

Dispatch `spec-fielder` foreground (you need its result to ask the user). The agent is read-only and returns `{id, title, slug, kind, gate, depends_on}` as a JSON code block on stdout.

```
Agent({
  subagent_type: "spec-fielder",
  description: "do-fast: derive fields",
  prompt: "User intent: <intent string>\n\nDerive id/title/slug/kind/gate/depends_on per .claude/agents/spec-fielder.md."
})
```

Parse the JSON from the agent's final tool result. If parsing fails, retry the agent once with an explicit reminder that the output must be a single JSON code block.

### Step 2 — Confirm fields

Show the user the four fields in a single `AskUserQuestion` with a multi-line description that names each field. Offer two options:

1. "Looks right — proceed" (recommended)
2. "Edit — let me adjust" (let the user supply free-text corrections)

If the user picks "Edit", apply their corrections inline (no need to re-run the spec-fielder for small text edits like a different `slug` or a renamed gate path). If the user's edit changes `kind` substantively, re-run the spec-fielder with their feedback as additional context.

Do not loop more than twice. If the user can't converge on the fields in two passes, recommend they switch to `/do` so align can interview them properly.

### Step 3 — Dispatch orchestrator

Spawn `do-fast-orchestrator` in the background. Its prompt is fully self-contained:

```
Agent({
  subagent_type: "do-fast-orchestrator",
  run_in_background: true,
  description: "do-fast/<slug>: orchestrate",
  prompt: <self-contained handoff>
})
```

The handoff string contains:
- Confirmed `{id, title, slug, kind, gate, depends_on}` (verbatim from Step 2).
- The original user intent string (verbatim — the orchestrator synthesises an aligned-plan section from it).
- The absolute path of the repo root (`pwd` at dispatch time).
- Termination clause: "exit after the implementer's Step 10 report (or after opening the draft PR on judge-rejection-3-strikes). Do not `git pull`."

After dispatch, the main session is done. Print one line confirming dispatch:

```
/do-fast dispatched <id>-<slug> (kind: <kind>) — orchestrator running in background.
```

When the orchestrator's completion notification arrives, relay its final report to the user verbatim. Do not paraphrase.

## Rules

- **Same as `/do`** — every rule from `/do/SKILL.md` still applies, because Steps 3–10 are unchanged. The only delta is that align is skipped.
- **Skipping align is your responsibility.** The user invoked `/do-fast`, signalling they accept the trade-off (no misalignment-catching before tests are written).
- **Confirm fields before dispatch.** The single `AskUserQuestion` in Step 2 is the only human gate. Skipping it would make `/do-fast` fully autonomous, which is a different skill.
- **Field confirmation is not align.** Do not slide into a multi-question interview. If the fields aren't confirmable in one prompt, the intent is too ambiguous for `/do-fast` — recommend `/do`.
- **Delegate after confirmation.** Once the user confirms, the main session must dispatch `do-fast-orchestrator` (`run_in_background: true`). Re-engagement is via the subagent's completion notification.

## When NOT to invoke

- Intent is vague or open-ended ("improve the dashboard", "make this better") → use `/do` so align interviews properly.
- The change requires architectural decisions across multiple modules → use `/do`.
- You'd want to discuss alternatives before committing to an approach → use `/do`.
- An active spec already exists matching this intent → `cd` into its worktree and resume.
- Trivial typo in a non-protected file → commit directly on `main`.

## Parallelism

To run multiple `/do-fast` invocations in parallel: dispatch each via the `Agent` tool in a single message. Each subagent runs in isolation, opens its own worktree, opens its own PR. No file conflicts are possible until PR merge time.

## Escalation

All escalation paths are owned by the orchestrator and the specialist agents — same as `/do`:
- Tester blocker → orchestrator relays and exits.
- Judge-rejection-3-strikes → orchestrator opens a draft PR with `tester-review.md` for human review.
- Implementer blocker → orchestrator relays and exits.
- CI red → `ci-feedback.ts` writes a brief; the implementer's paused report names the path.

## References

- `.claude/skills/do/SKILL.md` — the canonical pipeline. `/do-fast` is `/do` minus Step 1 (align) and minus the inline Step 2 confirmation; everything from worktree-open onwards is identical.
- `.claude/agents/spec-fielder.md` — derives the four fields from intent.
- `.claude/agents/do-fast-orchestrator.md` — runs Steps 3–10 in a subagent.
- `.claude/agents/spec-tester.md`, `spec-judge.md`, `spec-implementer.md` — unchanged; same dispatch contracts as `/do`.
