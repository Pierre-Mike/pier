# Design

## Approach

`cp` the three files from main's untracked working tree into the worktree at the corresponding paths. Author a hermetic smoke that asserts each file exists and parses YAML-ish frontmatter for the required keys. The smoke uses simple line-based frontmatter scanning (no YAML library) since we only check presence of `name:` (all three) and `description:` (skill).

## Files touched

- `.claude/skills/do-fast/SKILL.md` — new (5.9K, copied from main's untracked tree)
- `.claude/agents/do-fast-orchestrator.md` — new (194 lines, copied)
- `.claude/agents/spec-fielder.md` — new (111 lines, copied)
- `scripts/smoke-do-fast-bundle.ts` — new (gate)

## Decisions

- **Smoke parses frontmatter via line-grep, not a YAML library** — only two keys to check, both top-level scalars. Avoids adding a dep for trivial structure assertions.
- **Copy as-is, no behavioural edits** — the bundle was already validated by the orchestrator-app session (trace `e43a4f72`); the spec's job is to formalise governance, not re-author. Any future change to `/do-fast` lands on its own spec.
- **Kind `workflow`, not `code`** — the deliverables are markdown (skill + agent definitions) plus a gate script. No runtime code path is added inside the running app; this is a harness change, which matches the workflow convention used by 025/026.

## Risks

- The bundle's runtime behaviour (spawning `spec-fielder` foreground + `do-fast-orchestrator` background) is not exercised by this smoke. Mitigation: the bundle's first real use will surface bugs; the smoke only asserts structural integrity. A follow-up `kind: code` spec could add an end-to-end smoke that runs `/do-fast --dry-run` once such a flag exists.

## Out of scope

- Changes to `/do`, `/retro`, or any other skill.
- Behavioural improvements to `/do-fast` itself (e.g. handling for ambiguous intents). Defer to follow-up specs.
- Auto-cleanup of the worktree after merge. Separate finding.
