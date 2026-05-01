---
name: expertise
description: >
  Teaches any agent to accumulate and retrieve domain expertise across sessions,
  AND to always check for AGENTS.md / CLAUDE.md whenever entering a directory.
  Each domain stores expertise as a section inside its CLAUDE.md, referencing
  detailed knowledge in expertise-refs/. A central Expertise Index in the
  project's AGENTS.md auto-discloses all domains to every agent on session start.

  Use when: entering any directory to do work (the directory-entry rule: read
  AGENTS.md / CLAUDE.md if present, every time), starting a task in a specific
  domain (check the index, read relevant CLAUDE.md and refs), completing a task
  where something non-obvious was discovered (write to expertise-refs/),
  encountering an old expertise.yaml or standalone EXPERTISE.md (migrate it),
  or any agent spawned to do domain-specific work.

  The expertise system is agent-generated and agent-consumed — no human curation
  required. It grows session by session, domain by domain, with built-in
  confidence tracking and consolidation to stay lean.
---

# Expertise

Agents collectively build a knowledge base by saving non-obvious learnings
into the codebase directories they work in. Knowledge lives next to the code
it describes, discoverable via a central index.

## Architecture

```
AGENTS.md — always auto-loaded
└── ## Expertise Index
    - [extensions/captain](extensions/captain/CLAUDE.md) — Pipeline orchestration
    - [src/payment](src/payment/CLAUDE.md) — Stripe: webhooks, idempotency

extensions/captain/
├── CLAUDE.md                 ← may contain other instructions +
│                               ## Expertise section (refs + summary)
└── expertise-refs/
    ├── gotchas.md            ← entries with confidence + timestamps
    ├── patterns.md
    └── conventions.md
```

Three tiers of progressive disclosure:

1. **Index** (always loaded) — one line per domain in AGENTS.md. Agent sees
   all available expertise on session start, picks relevant domains.
2. **CLAUDE.md** (auto-loaded on demand) — the directory's CLAUDE.md contains
   an `## Expertise` section with summary + reference list. Claude Code
   auto-loads this when working in the directory.
3. **Refs** (selective) — individual expertise-refs/ files. Agent loads only
   what the task needs.

## The Directory-Entry Rule (always)

**Every time you enter a directory to do work, check for `AGENTS.md` and
`CLAUDE.md` in that directory — and in every parent directory up to the
repo root — and read any you find before touching code.** This is not
optional and not scoped to expertise tasks. It applies to every agent,
every session, every task, including one-line edits.

Why: these files contain conventions, gotchas, and constraints you cannot
deduce from the code alone. Skipping them is the single most common way
agents produce work that technically runs but violates a rule the team
already wrote down.

What this looks like in practice:

1. Before the first read/edit/bash in a new directory, list its files and
   check for `AGENTS.md` / `CLAUDE.md`. Walk upward to the repo root doing
   the same at each level. Read every one you find.
2. When a CLAUDE.md has an `## Expertise` section, treat its `References`
   list as a menu and load only the refs your current task touches.
3. When an AGENTS.md has an `## Expertise Index` (or similar), use it to
   discover related domains your task may cross into, and repeat step 1
   for those directories.
4. Claude Code auto-loads the nearest CLAUDE.md on entry. Other agents
   (spawned subagents, pi sessions, scripts calling `claude -p`) do not —
   they must load these files explicitly.

If a directory has neither file, move on. Missing files mean the area is
unexplored, not a problem.

## Before Starting Expertise-Specific Work: Read

1. The Expertise Index in AGENTS.md is already in your context (auto-loaded).
2. Identify domains relevant to your task from the index.
3. Read the CLAUDE.md for those domains — look for the `## Expertise` section.
4. Scan the Expertise section's References — load only the refs you need.
5. Check Related Domains — follow links if your task crosses boundaries.

## After Completing Work: Decide Whether to Write

Apply this test to every significant finding:

```
1. Would a future agent working here benefit from knowing this?
2. Is it non-obvious — not deducible by reading the code?
3. Is it stable — likely to remain true across future sessions?
```

Write only if all three answers are YES.

**Write**: Stripe webhooks must precede body parsing middleware or signature
validation always fails. — Future agents benefit (YES), not visible in code
(YES), stable architecture rule (YES).

**Don't write**: Used the repository pattern for this service, same as the
others. — Not non-obvious (NO). Future agents can see the pattern by reading
the codebase.

## How to Write

### To an Existing Domain

1. Read CLAUDE.md in the domain directory — find the `## Expertise` section
   and identify which ref file fits (gotcha? pattern?).
2. Read that specific `expertise-refs/<type>.md`.
3. Find the next available ID (e.g., after PAY-G003, use PAY-G004).
4. Append your entry with `confidence: 0.6` and today's date.
5. Update the ref file's frontmatter (`updated`, `updated_by`).
6. If the ref file doesn't exist yet, create it and add a reference line
   to the Expertise section in CLAUDE.md.

### New Domain (First Write)

1. Open the directory's CLAUDE.md (create it if it doesn't exist).
   **Do not overwrite existing content.** Append an `## Expertise` section:

```markdown
## Expertise

<2-4 sentences: what this directory does and the most important context
for any agent starting work here.>

### References

- [Gotchas](expertise-refs/gotchas.md) — <one-line summary>

### Related Domains
```

2. Create `expertise-refs/<type>.md` with your first entry (see Entry Format below).

3. Add one line to the Expertise Index in AGENTS.md as a markdown link:

```markdown
- [<path/to/directory>](<path/to/CLAUDE.md>) — <Domain description: key topics covered>
```

## Entry Format

Each entry in a ref file is a markdown bullet with bold ID+title, inline
metadata, and indented description:

```markdown
- **PAY-G001: Stripe webhook must precede body parser**
  confidence: 0.7 | added: 2026-03-15 | validated: 2026-04-08
  Signature validation needs the raw body. Body parser consumes it.
  If webhook route comes after body parser, validation always fails.
```

New entries start at `confidence: 0.6`. When you encounter an existing entry
and verify it's still true in a new context, bump confidence by +0.1 (cap 0.95)
and update the `validated` date. **Only bump if >5 days since last validation**
— this prevents confidence inflation from multiple agents re-validating the
same entry in quick succession.

Superseded entries use strikethrough:

```markdown
- ~~**PAY-G002: Use test clock for subscription tests**~~
  *Superseded: Stripe now supports native test mode. See PAY-G003.*
```

## ID Format

`<DIR_PREFIX>-<TYPE><SEQ>` — e.g., `PAY-G001`, `FE-C002`, `CAP-P001`

- Prefix: first 2-3 uppercase letters of the directory name
- Type: P (pattern), G (gotcha), C (convention), D (decision)
- Sequence: three-digit, zero-padded, never reuse, never fill gaps

## What Goes Where

| Knowledge type | Ref file | Example |
|----------------|----------|---------|
| Something that works well and why | patterns.md | "Optimistic updates via TanStack Query reduce perceived latency" |
| A trap that looks correct but isn't | gotchas.md | "Stripe webhooks must precede body parser" |
| A rule this domain enforces | conventions.md | "All currency stored as integer cents — never floats" |
| Why something was built this way | decisions.md | "Chose Effect-TS over try/catch for typed error propagation" |

Convention vs gotcha: if a design decision also creates a failure mode, classify
as **convention** and include the failure note. Reserve gotcha for failures
caused by following normal instincts with no deliberate design to explain.

## Confidence Lifecycle

```
0.6 (seedling)  →  validated in new context  →  0.7 (growing)
                   (>5 days since last)
                →  validated again           →  0.8+ (proven)
                   (>5 days since last)

Proven entries (≥0.8) are protected from time-based pruning.
Seedling entries (<0.6) older than 90 days with no validation are prunable.
```

**Anti-inflation rule**: only bump confidence if the `validated` date is >30
days old. Multiple agents encountering the same entry within 5 days do NOT
stack bumps — they just confirm the existing confidence level.

## Consolidation

When a ref file exceeds ~500 lines, consolidate:

1. **Remove superseded chains** — where the replacement has confidence ≥0.8
2. **Merge entries** on the same topic — keep highest confidence, combine descriptions
3. **Prune** — entries that are: confidence <0.6 AND older than 90 days AND never reinforced
4. **Flag orphans** — entries referencing files/functions that no longer exist

Consolidation is opportunistic — triggered when an agent reads a ref and
notices it's large. Not a scheduled process.

## Handling Outdated Expertise

When you find an entry that contradicts current reality:

1. Strikethrough the old entry with a superseded note
2. Add a new entry with the correct information at confidence 0.6
3. The old entry will be cleaned up during consolidation once the new one reaches ≥0.8

When you encounter an entry and can verify it's still true, bump its confidence.

## Migrating Old Formats

### expertise.yaml (legacy YAML)

When you encounter an `expertise.yaml` file:

1. Append `## Expertise` section to the directory's CLAUDE.md (create if needed)
   using `meta.domain` and `summary`
2. Create `expertise-refs/` directory
3. Convert each YAML section into its own markdown ref file
4. Add `confidence: 0.7` to migrated entries (they were already validated once)
5. Add `added: <original updated date>` from the YAML meta
6. Delete the old `expertise.yaml`
7. Add the domain to the Expertise Index in AGENTS.md

### Standalone EXPERTISE.md (old hub format)

When you encounter a standalone `EXPERTISE.md` file:

1. Read the EXPERTISE.md content (summary, references, related domains)
2. Open the directory's CLAUDE.md (create if needed)
3. Append the content as an `## Expertise` section — do not overwrite existing
   CLAUDE.md content
4. Delete the old `EXPERTISE.md`
5. Update the Expertise Index in AGENTS.md to point to CLAUDE.md instead

## Reference

See `schema.md` for the full annotated format with all fields.
