# Design

## Approach

One-line edit to the root `package.json` — `"prepare": "bunx lefthook install"` becomes `"prepare": "bunx lefthook install --force"`. The hermetic smoke creates a temporary git repo, sets `core.hooksPath` on it (mimicking the worktree state), copies a minimal `lefthook.yml` into it, then runs `bunx lefthook install --force` from that cwd. Asserts exit 0. To prove the smoke actually catches regressions, it ALSO runs `bunx lefthook install` (no flag) and asserts exit ≠ 0 — if both pass with the same flag, the contract is broken.

## Files touched

- `package.json` — append `--force` to root `prepare` script.
- `scripts/smoke-prepare-lefthook-with-hookspath.ts` — new gate. Hermetic; uses `mkdtemp` + `git init` + `git config core.hooksPath` to reproduce the conflict.

## Decisions

- **`--force` over `--reset-hooks-path`** — `--force` leaves the user's git config alone; `--reset-hooks-path` would unset `core.hooksPath`, which may be deliberate on the user's machine. `--force` is also what the lefthook hint suggests for "install hooks anyway."
- **Smoke uses real `bunx lefthook`, not a stub** — lefthook is already a project dev dep, so the smoke can invoke it without a contract layer. The behavior we want to assert is purely "what does lefthook do when `core.hooksPath` is set?" — stubbing would defeat the test.
- **Smoke runs both with-flag and without-flag** — proves the smoke distinguishes the regression case. Without this, a future change to lefthook that removes the conflict would silently neuter the test.

## Risks

- lefthook upstream changes the `--force` semantics or removes the flag. Detection: smoke fails, error message points at lefthook. Mitigation: pin lefthook version (already done at 2.1.4 in package.json) and update on upgrade.
- `core.hooksPath` is unset in some CI environments, and `--force` becomes a no-op there. That's actually the desired behavior — the change is harmless when no conflict exists.

## Out of scope

- Changing `worktree-open.ts` to handle lefthook differently. The root cause is the prepare script, not the worktree script.
- Removing lefthook entirely. Out of scope; lefthook is desired tooling.
- Auto-cleanup of post-merge worktrees (deferred finding #2 from prior retro). Separate spec.
