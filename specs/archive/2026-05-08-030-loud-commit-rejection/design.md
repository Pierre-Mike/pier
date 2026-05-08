# Design

## Approach

Append a shell-OR clause to the biome run command in `lefthook.yml`. When biome exits 0, the OR doesn't trigger. When biome exits non-zero, the wrapper prints the rejection line on stderr and exits 1, propagating the failure cleanly. The smoke creates a tmp `.ts` file with an unfixable biome error (e.g. `as` cast outside test, or `any` usage), runs the same biome command pipeline, and asserts the rejection line is on stderr.

## Files touched

- `lefthook.yml` — change `run:` line for the biome command.
- `scripts/smoke-loud-commit-rejection.ts` — new gate.

## Decisions

- **`||`-wrapped echo, not a separate script** — keeps the change to one file and one line. A separate `scripts/biome-pre-commit.sh` would scatter the logic without buying anything.
- **Stderr, not stdout** — git/lefthook tooling already use stdout for progress; stderr is the correct channel for terminal failures.
- **Plain ASCII `✖` for the marker** — already used by the `worktree-close.ts` and other scripts. Consistent.
- **Surgical scope: visibility only, no lint-policy change** — broader changes (`--unsafe` to auto-fix more) carry team-impact and are deferred. This spec fixes only the symptom.

## Risks

- Some shells (dash, busybox `sh`) handle `(echo ... >&2; exit 1)` slightly differently — bash and zsh handle it correctly. lefthook runs hooks under the user's shell; on macOS+zsh and Linux+bash this works. Mitigation: low — the project is already bun/macOS-centric.
- Future changes to the biome command line that omit the wrapper silently regress this spec. Detection: the smoke contract layer asserts the wrapper presence in lefthook.yml.

## Out of scope

- `--unsafe` auto-fixes for biome. Separate spec.
- Agent guidance in CLAUDE.md about post-commit verification. Separate concern (informational, not enforced).
- Wrapping pre-push or post-merge similarly. Pre-commit is where the silent-rollback hit; pre-push exits visibly to the terminal already.
