# Expertise Format Reference

Full annotated format for expertise sections in `CLAUDE.md` and `expertise-refs/` content files.

## Expertise Section in CLAUDE.md

Expertise lives as an `## Expertise` section inside the directory's CLAUDE.md.
Do not overwrite existing CLAUDE.md content — append the section if not present.

```markdown
## Expertise

2-4 sentences describing what this domain/component does and the most
important context for any agent starting work here. Update only when the
area's purpose or key context changes significantly.

### References

- [Gotchas](expertise-refs/gotchas.md) — one-line summary of what's inside
- [Patterns](expertise-refs/patterns.md) — one-line summary of what's inside
- [Conventions](expertise-refs/conventions.md) — one-line summary of what's inside
- [Decisions](expertise-refs/decisions.md) — one-line summary of what's inside

### Related Domains

- [Shared Types](../shared/CLAUDE.md) — cross-domain type definitions
- [API Layer](../api/CLAUDE.md) — backend contracts this frontend consumes
```

### Rules

- Appended to CLAUDE.md — never a standalone file
- The expertise section should stay under 50 lines — it's a table of contents, not content
- Only list ref files that exist — no stubs
- Summary written once on creation, updated only when domain purpose changes
- Related Domains links to neighboring CLAUDE.md files
- Do not overwrite or reorder existing CLAUDE.md content above the expertise section

## Ref Files: expertise-refs/*.md

```markdown
---
domain: payment
type: gotchas
updated: "2026-04-08"
updated_by: "worker-payment-3"
---

# Payment Gotchas

- **PAY-G001: Stripe webhook must precede body parser**
  confidence: 0.8 | added: 2026-03-15
  Signature validation needs the raw body. Body parser consumes it.
  If webhook route comes after body parser, validation always fails.

- **PAY-G002: Idempotency keys must include request hash**
  confidence: 0.6 | added: 2026-04-08
  Using only the request ID as idempotency key misses retries with
  different payloads. Include a hash of the request body.

- ~~**PAY-G003: Use test clock for subscription tests**~~
  *Superseded: Stripe now supports native test mode. See PAY-G004.*
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `domain` | yes | Domain name matching the expertise section in parent CLAUDE.md |
| `type` | yes | One of: `patterns`, `gotchas`, `conventions`, `decisions` |
| `updated` | yes | ISO date of last update to this file |
| `updated_by` | yes | Agent identifier that last wrote to this file |

### Entry Inline Metadata

Each entry includes metadata on a dedicated line after the bold title:

```
confidence: 0.X | added: YYYY-MM-DD | validated: YYYY-MM-DD
```

| Field | Description |
|-------|-------------|
| `confidence` | 0.6 (new) → +0.1 per validation in new context → cap 0.95 |
| `added` | ISO date when the entry was first created |
| `validated` | ISO date of last confidence bump. Only bump if >5 days since last validation to prevent inflation. |

### Entry Format by Type

**Patterns** — things that work well:
```markdown
- **FE-P001: Short title**
  confidence: 0.7 | added: 2026-03-10 | validated: 2026-04-08
  What the pattern is and why it works.
```

**Gotchas** — non-obvious traps and failure modes:
```markdown
- **FE-G001: Short title**
  confidence: 0.8 | added: 2026-02-20 | validated: 2026-04-01
  What goes wrong, why it's non-obvious, how to avoid it.
```

**Conventions** — local rules agents must follow:
```markdown
- **FE-C001: Short title**
  confidence: 0.9 | added: 2026-01-15 | validated: 2026-03-20
  The specific rule as an imperative statement.
  Include failure mode if the convention also creates a trap.
```

**Decisions** — why something was built a specific way:
```markdown
- **FE-D001: Short title**
  confidence: 0.7 | added: 2026-03-01 | validated: 2026-04-05
  What was decided and why this choice was made over alternatives.
```

### Superseded Entries

```markdown
- ~~**FE-C001: Use class components for stateful UI**~~
  *Superseded: Codebase migrated to hooks as of 2026-03. See FE-C002.*
```

Superseded entries are cleaned up during consolidation once the replacement
reaches confidence ≥0.8.

## Convention vs Gotcha

- **Convention**: how the system works by design — a rule. *"Is the primary thing to communicate how this system is built?"* → convention.
- **Gotcha**: a silent failure mode triggered by normal instincts. *"Does following standard practice break something here?"* → gotcha.
- **When both apply**: classify as convention, include the failure note in the description.

## ID Format

`<DIR_PREFIX>-<TYPE><SEQ>`

| Component | Rule | Examples |
|-----------|------|----------|
| Prefix | First 2-3 uppercase letters of directory name | FE, BE, PAY, IN, CAP |
| Type | P (pattern), G (gotcha), C (convention), D (decision) | G, P, C, D |
| Sequence | Three-digit, zero-padded, sequential | 001, 002, 003 |

**Rules:**
- Never reuse an ID, even after an entry is superseded
- Continue from the highest existing ID in each type sequence
- Never fill gaps (if FE-G001 and FE-G003 exist, next is FE-G004)
- IDs are permanent — superseded notes use them as cross-references

## Domain Prefix Conventions

| Domain | Prefix | Example IDs |
|--------|--------|-------------|
| frontend | FE | FE-G001, FE-C002 |
| backend | BE | BE-P001, BE-D003 |
| payment | PAY | PAY-G001 |
| infra | IN | IN-C001 |
| captain | CAP | CAP-G001 |
| voice | VO | VO-C001 |
| agentic | AG | AG-G001 |
| scripts | SC | SC-G001 |
| hooks | HK | HK-G001 |
| skills | SK | SK-G001 |
| subagent | SA | SA-G001 |

For component-level files, use the parent domain prefix.

## Consolidation Rules

When a ref file exceeds ~500 lines:

1. Remove superseded chains where replacement has confidence ≥0.8
2. Merge entries covering the same topic (keep highest confidence)
3. Prune: confidence <0.6 AND older than 90 days AND never reinforced
4. Flag orphans: entries referencing files/functions that no longer exist

## Expertise Index Entry Format

In AGENTS.md:

```markdown
## Expertise Index

- **exp-captain** — Pipeline orchestration: widget rendering, state, tool results → extensions/captain/CLAUDE.md
- **exp-payment** — Stripe integration: webhooks, idempotency, refunds → src/payment/CLAUDE.md
```

One line per domain. Sorted alphabetically. Agent appends when creating a new domain.
