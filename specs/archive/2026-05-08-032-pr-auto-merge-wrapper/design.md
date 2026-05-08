# Design

## Approach

Single-purpose Bun script. Reads PR identifier from argv[2]. Spawns `gh pr merge --auto --squash --delete-branch <pr>` (silent). Polls `gh pr view <pr> --json autoMergeRequest` every 1.5 seconds for up to 10 seconds. Branches on the polled `autoMergeRequest` field:
- non-null → print `✓ auto-merge queued for <pr>`, exit 0
- null after timeout → print the four-line "NOT QUEUED — wait for CI then run: gh pr merge --squash --delete-branch <pr>" message, exit 0

Both `gh` invocations honour `PIER_PR_MERGE_GH_BIN` so the smoke can drive the script with a stubbed binary that mimics the two scenarios deterministically.

## Files touched

- `scripts/pr-merge-auto.ts` — the wrapper, ~80 LOC.
- `scripts/smoke-pr-merge-auto.ts` — gate. Builds two bash stubs (queued / not-queued), runs the wrapper against each, asserts the printed outcome.

## Decisions

- **Exit 0 in both outcomes** — failure to queue is a normal state (CI completed pre-queue is the most common cause). Exiting 1 would propagate misleading errors up the calling pipeline.
- **Poll for 10s with 1.5s interval** — empirically the GraphQL "clean status" response lands within ≤2s, so 10s is generous but bounded. Fixed-interval polling beats single-shot because the auto-merge state can flip post-call.
- **Two stub scenarios in the smoke, not three** — the "auto-queued then later flipped to merged" path collapses into the queued outcome from the wrapper's perspective; no need to model it.
- **No fallback to direct `--squash` in this spec** — keeps the harness rule intact and the spec small. The printed manual command is the bridge.
- **`PIER_PR_MERGE_GH_BIN` env var convention** — mirrors `PIER_PREFLIGHT_GH_BIN` from spec 025. Same idea: hermetic-stubbable.

## Risks

- The 10-second timeout is too short for some CI configurations where `gh` itself is slow. Detection: out-of-band testing on next real PR. Mitigation: bump to 20s if needed in a follow-up.
- A future `gh` version changes the `autoMergeRequest` field shape. Detection: smoke fails because parsing breaks. Mitigation: snapshot the field name in a comment for traceability (already done — see decision above).

## Out of scope

- Modifying `/do` SKILL.md to call the wrapper. Adoption is a separate spec — verify the wrapper in shadow first by invoking it manually for the next 2-3 PRs and confirming it prints the right outcome before wiring it into the rails.
- Adding `--force-fallback` flag for direct merge. Bypass-the-rule territory; defer.
- Integration with `/do-fast`. Identical to `/do` adoption — separate spec.
