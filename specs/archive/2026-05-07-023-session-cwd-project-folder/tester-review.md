# Tester review — 023-session-cwd-project-folder (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC 1 (resolveProjectCwd exported) → import at sessions.repo.test.ts:9 + smoke-023-session-cwd.ts:10; both fail to compile/run if not exported. ✓
  - AC 2 (returns `<root>/<projectId>` when dir exists) → "returns <projectsRoot>/<projectId> when that directory exists" (test line 219). Also covered by smoke line 16-20. ✓
  - AC 3 (returns `<root>` when dir missing) → "returns <projectsRoot> when <projectId> directory does not exist" (test line 224). Also smoke line 22-26. ✓
  - AC 4 (open passes resolved cwd to Bun.spawn) → "open(projectId) passes <projectsRoot>/<projectId> to spawn when directory exists" (line 288) + "...when directory does not exist" (line 304). ✓
  - AC 5 (openDefault passes `<projectsRoot>`) → "openDefault() passes <projectsRoot> to spawn" (line 319). ✓

### 2. Adversarial gap
YES (minor — does not block PASS)
A plausible but contrived bypass: an implementation could spawn multiple `--session` commands and place the correct cwd on a later one while the first uses a wrong cwd. Tests assert `sessionSpawns[0]?.cwd`, so the first matching spawn must be correct. In practice the `spawnNamedSession` path emits a single session-bearing spawn, so the bypass surface is narrow. Searched for other gaps (e.g. resolving cwd correctly in helper but ignoring it in service): the service-surface assertions at lines 301/316/331 close that hole.

### 3. Coverage gap
NO
All five testable properties from the Intent + ACs are covered. The unit tests pin the pure helper's contract; the live-layer tests pin the cwd at the `Bun.spawn` boundary, which is the exact observable contract named in the proposal ("assert the `cwd` captured at the `Bun.spawn` boundary").

### 4. Behavior vs implementation detail
YES (tests behavior-pinned)
- Helper tests use real `mkdtempSync` + `mkdirSync` and assert returned path strings — pure observable behavior.
- Live-layer tests intercept `Bun.spawn` (the actual OS-level boundary the proposal names) and assert the `cwd` option. Filtering by `args.includes("--session") && !args.includes("list-sessions")` is a behavioral filter on the spawn shape, not coupled to internal function names.
- Smoke script asserts only return values of the exported helper.
- No coupling to internal closure names, line numbers (the spec 021 source-extraction tests are pre-existing and out-of-scope here), or library version strings.

## Verdict summary
PASS. All five ACs map to explicit tests; tests are pinned to observable behavior (filesystem state and Bun.spawn cwd argument); the only adversarial gap is a narrow ordering bypass that is closed by the single-session-spawn shape of the live path. Gate is sound for the spec-implementer.
