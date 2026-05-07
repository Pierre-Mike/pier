# Design

## Approach

Two changes in `scripts/preflight-main-ci.ts`: rename `htmlUrl` → `url` in the `RunEntry` interface and the `--json` argv, and update the corresponding `latest.htmlUrl` → `latest.url` in the error log. Update smoke stubs to use `url` (case A and case B JSON). Add a Case D contract check in the smoke that reads the script's source as text, extracts the `--json` argument value, splits it on commas, and asserts every field is in a hardcoded `ALLOWED_GH_FIELDS` set (snapshot of `gh run list --json` valid fields on gh 2.90.0).

## Files touched

- `scripts/preflight-main-ci.ts` — rename `htmlUrl` → `url` (3 sites: `RunEntry` interface field, `--json` argv string, error log substitution).
- `scripts/smoke-preflight-main-ci.ts` — update stub JSON in cases A and B to use `url`; add `ALLOWED_GH_FIELDS` constant + Case D contract check.

## Decisions

- **Static allowed-list, not live-gh introspection** — keeps smoke hermetic per 025's invariant. Trade-off: list goes stale on gh major upgrades. Mitigation: snapshot is small (16 fields), refresh in a follow-up spec when gh ships a breaking field rename. Acceptable because the cost of a stale list is exactly what this spec fixes (hard error at /do time pointing at the right line).
- **Read script source as text, not import** — the script uses `Bun.spawn` with hardcoded argv. Reading the file as a string and matching the `--json` argument value with a tolerant regex is simpler than dynamic introspection and tolerates argv reordering.
- **No new file** — extending the existing smoke keeps gate identity stable; the spec amends 025 rather than replacing it.

## Risks

- `ALLOWED_GH_FIELDS` drifts from real gh after a major release. Detection: real `gh` exits non-zero with a fresh field name complaint; mitigation: update the allowed-list snapshot in a follow-up spec.

## Out of scope

- Refactoring preflight to use a `--json` schema validation library. Overkill for 16 fields.
- Live-gh integration test. Violates the hermetic-smoke constraint inherited from 025.
- Auto-refresh of `ALLOWED_GH_FIELDS` from real gh. Defer; handle on gh upgrade.
