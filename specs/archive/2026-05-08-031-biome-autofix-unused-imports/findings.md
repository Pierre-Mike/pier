# /retro findings (window: 2026-05-01 → 2026-05-08, 19 PRs, 16 specs) — 2026-05-08 (seventh)

Seventh retro overall. Prior chain: 025 → 026 → 027 → 028 → 029 → 030.

Spec 029's post-merge hook fired for the first time during this session's `git pull` and auto-cleaned the prior worktree (`spec/loud-commit-rejection`). Confirmed in lefthook output: `found 1 merged spec branch(es) … ✓ spec/loud-commit-rejection`. Two layers of friction permanently retired (lefthook prepare + post-merge sweep) — `/do` cycle is now invisible-by-default in the happy path.

## Top finding (acted on by spec 031)

### #1 — Biome's `noUnusedImports` auto-fix is classified "unsafe" and skipped by `--write`

Spec 030 added a clear `✖ COMMIT REJECTED` marker on biome failures (signal). This finding addresses the root cause: nearly every silent rollback during 028/029 was a leftover named import that biome flagged but refused to auto-fix because the rule's fix is classified "unsafe." Verified empirically — `bunx biome check --write` against `import { join } from "node:path"; export const x = 1;` prints "Skipped 1 suggested fixes" and leaves the import in place.

**Hypothesis**: biome's "unsafe" classification on `noUnusedImports` exists to handle edge cases (side-effect-only imports, runtime reflection on imports), but those cases have no named bindings — the rule never fires on them. For the only case where the rule DOES fire (a leftover named import), the fix is genuinely safe.

**Action**: per-rule override in `biome.json` — declare `noUnusedImports` as `{ level: "error", fix: "safe" }`. Biome 2.4.7 honours this override and `--write` (no `--unsafe`) auto-removes unused imports. No change to `lefthook.yml` or any pre-commit invocation. Hermetic gate: snapshot-assert biome.json + behavioural experiment proving a fixture with an unused import gets rewritten by the existing pre-commit pipeline.

## Deferred findings

### #2 — `git pull` aborts when a spec lands files that previously existed locally as untracked (carries from 4th, 5th, 6th)

Five retros now without action. Reproduces deterministically when the user authors meta-tools in `~/Github/pier/.claude/...` to test in-session, then a spec branch re-creates the same files. Last triggered after spec 027 merged. **Defer**.

### #3 — `gh pr merge --auto` silently rejects "clean status" PRs (carries from 3rd, 4th, 5th)

Five retros now. PR 46 (spec 030) merged via `--auto` cleanly — first auto-merge in the chain to actually fire. Possibly the rejection is a race with PR creation timing rather than a hard rule. **Defer**: continue collecting samples; if the next 2 retros' PRs all auto-merge cleanly, retire this finding.

### #4 — Workflow-kind specs skip judge → no `tester-review.md` (carries)

All seven specs from 025 onward are kind: workflow. None have rubric review. Per `/do` Step 2.5 dispatch table this is intentional. **Defer**: documentation-only.

### #5 — Tooling friction effectively zero across in-window traces (carries)

No new data. **Defer**: trace-capture audit.
