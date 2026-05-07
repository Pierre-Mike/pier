# /retro findings (window: 2026-04-30 → 2026-05-07, 14 PRs, 11 specs) — 2026-05-07 (later)

Second retro of the day. The earlier retro (authored as 025) acted on red-main-CI bleed. This one runs ~50 minutes after 025 merged.

## Top finding (acted on by spec 026)

### #1 — Spec 025's preflight ships a stale gh field name (`htmlUrl` vs `url`)

`scripts/preflight-main-ci.ts` (shipped 2026-05-07T20:07:00Z in PR #41) requests `htmlUrl` from `gh run list --json`. Real gh 2.90.0 (2026-04-16) has `url`. The hermetic smoke `scripts/smoke-preflight-main-ci.ts` never validates against real gh — its bash stubs echo whatever JSON the test harness writes, so cases A/B/C all pass with the stale name. Discovered when this very `/retro` invoked `/do` to author an unrelated spec; `worktree-open.ts` aborted with `gh exited 1: Unknown JSON field: "htmlUrl"`. Net effect: every `/do` invocation between 20:07 and now would have hit the same wall.

**Hypothesis**: hermetic stubs that reflect test inputs back into assertions can't catch tool-schema regressions. The "stub-and-replay" pattern needs a separate contract layer that pins the real-tool schema.

**Action**: rename `htmlUrl` → `url` in the script + smoke stubs (3 sites in script, 2 in stubs). Add Case D to the smoke: read the script source, extract the `--json` argv value, assert every requested field is in `ALLOWED_GH_FIELDS` — a hardcoded snapshot of `gh run list --json invalid 2>&1`'s allowed list on gh 2.90.0. Keeps the smoke hermetic; catches the class.

## Deferred findings

### #2 — `/do-fast` skill bundle authored without spec governance

Three uncommitted paths sit in main's working tree as of 2026-05-07: `.claude/skills/do-fast/SKILL.md` (5.9K), `.claude/agents/do-fast-orchestrator.md` (194 lines), `.claude/agents/spec-fielder.md` (111 lines). They extend the harness (a new skill + two new subagents) but were authored directly on main, not on a spec branch. Repo discipline is "every change via /do" — meta-tools that augment that workflow shouldn't bypass it. Originally this retro's top finding; superseded by #1 because /do is now blocked. **Defer**: ship via /do once #1 is merged.

### #3 — Workflow-kind spec 025 has no `tester-review.md`

021–024 (code/feat kinds) all have `tester-review.md` of 2.8–4.6K with judge rubric content. 025 (workflow kind) has no `tester-review.md` at all. The previous retro's deferred finding #2 (claiming "always 0 bytes on PASS") was wrong — it confused absence with emptiness. The real signal: workflow-kind specs skip the judge step (per `/do` Step 2.5 dispatch table), so no review artifact is produced. Worth confirming this is intentional and documenting it. **Defer**: low leverage, no observable harm.

### #4 — PR #40 (feat 024) sat 70 minutes from create → merge despite 31s CI runtime

Created 18:35:53Z, CI started 19:31:14Z (56-minute pre-CI gap), CI completed 19:31:45Z (31-second runtime), PR merged 19:45:43Z (14 minutes post-CI). All other in-window PRs merge in 5–12 seconds. Hypothesis: queueing/auto-merge race tied to red main (since fixed by 025). **Defer**: addressed upstream.

### #5 — Tooling friction effectively zero across in-window traces

13 in-window traces, ~700+ tool events. No `tool_use_error`, no hook block (exit 2), no failed Edit/Write/Bash. Either harness is rock-solid or trace schema isn't capturing failures. **Defer**: verify capture before celebrating.
