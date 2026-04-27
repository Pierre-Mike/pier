# Tester review — 003 slice 2 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping (slice-2 ACs 1–3):
  - AC 1 (resolve `project.path` from `ProjectsService`; pass `cwd: project.path`) →
    - `AC1: project resolution > fails with a typed TerminalError when the projectId does not match any project` (resolution failure path) ✓
    - `AC1: project resolution > resolves successfully and returns a live session when the projectId is known` (resolution success path) ✓
    - `AC2: spawn args and cwd for new session > passes cwd equal to project.path — not the daemon's own cwd` (cwd binding) ✓
  - AC 2 (sanitized id → `--session` arg) →
    - `AC2 > invokes zellij with --session <sanitized-id> when opening a new session` ✓
    - `AC2 > sanitizes a project id with special chars before using it as --session arg` (non-trivial regex case `"my project!" → "my_project_"`) ✓
  - AC 3 (idempotent attach on reopen) →
    - `AC3 > calls spawn exactly once when open() is called twice for the same project` ✓
    - `AC3 > returns a live session on the second open without re-spawning` ✓

### 2. Adversarial gap
NO — searched, found no exploitable gap of structural concern.

Considered attacks:
  - Hard-code `--session my-app` ignoring sanitization → defeated by `PROJECT_SPECIAL` test pinning `"my_project_"`.
  - Hard-code `cwd` to a literal path → defeated by both fixtures having distinct `path` values; `cwd` is asserted against `PROJECT_*.path`.
  - Cache by id without spawning → defeated by the idempotency test asserting `calls.length === 1` (a strict 1, not 0). A no-op implementation would fail this.
  - Spawn twice but record once → not possible since the recorder is the spawn boundary itself.
  - Resolve project but ignore cwd in opts: opts is destructured and pinned; covered.

  Minor (cosmetic, non-blocking): tests assert `calls.length >= 1` for the new-session AC2 cases and only the first call is inspected. An implementation that spawns once correctly and then a second extraneous time with garbage args would still pass AC2 cases (but would fail AC3's `=== 1`). Since AC3 pins exact-once, the loophole is closed in practice.

### 3. Coverage gap
NO — none for in-scope slice-2 ACs.

All testable properties of ACs 1–3 are exercised:
  - cwd binding (positive + sanitization fixture)
  - --session flag presence + sanitized value
  - typed-error for unknown projectId (resolution failure)
  - idempotency via spawn-call counter
  - same returned id/status on reopen

ACs 4–8 are explicitly out of scope (slice 1 frozen / slice 3 pending).

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned.

Pinned via observable Effect Layer boundaries: `ZellijSpawn` Context.Tag is the spawn seam, `ProjectsService` via `makeProjectsServiceTest` is the project seam. Assertions are on:
  - the args array (looked up by `indexOf("--session")` rather than positional index — robust to argv ordering changes),
  - `cwd` string equality vs `project.path` (the contract), and
  - the call counter (cardinality of the side effect).

No assertions on internal function names, log strings, or file paths. The only structural coupling is the requirement that the implementer expose a `ZellijSpawn` Context.Tag and have `makeTerminalSessionsLive` require `ProjectsService + ZellijSpawn` — but this is documented in the gate file's header docstring as the contract injection surface, so it is intent-pinned, not detail-pinned.

## Verdict summary

PASS. The gate file maps each in-scope AC (1–3) to ≥1 test, uses two distinct project fixtures so neither cwd nor sanitization can be hard-coded, and pins idempotency with an exact `=== 1` spawn counter that closes the obvious adversarial loopholes. Tests target Effect Layer seams (observable behavior), not implementation internals. Slice-1 harness preserved as a regression guard. Ready for spec-implementer.
