# Tester review — 036 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
  - AC 1 (existing dir → join(root, projectId)) → test "returns join(root, projectId) when that directory exists" in spec-036 describe block ✓
  - AC 2 (missing dir → join(root, projectId)) → test "returns join(root, projectId) even when that directory does not exist" ✓
  - AC 3 (sessions.open passes join(projectsRoot, projectId) regardless of disk) → test "open(projectId) passes join(projectsRoot, projectId) to spawn when directory does not exist" ✓
  - AC 4 (smoke script exits 0) → smoke-035-session-cwd-project.ts exercises both missing and existing dir cases ✓

### 2. Adversarial gap
NO — searched, found none

The tests use multiple different project ID strings across the unit tests and smoke script ("brand-new-project", "ghost-project-036", "new-project"), eliminating the string-hardcoding bypass. The `resolveProjectCwd` pure helper is tested directly (AC 2), and the Live service integration is tested via Bun.spawn mock (AC 3). An implementation must change both the helper and the live service's cwd resolution to pass all tests.

### 3. Coverage gap
NO — none

Note for implementer: the gate file still contains an old spec-023 test ("returns `<projectsRoot>` when `<projectId>` directory does not exist") that will break after the fix. Task 2 in tasks.md explicitly covers updating this test to assert the new contract. This is intentional — the implementer must update both the implementation and the obsolete spec-023 assertion.

### 4. Behavior vs implementation detail
YES — tests are behavior-pinned

- `resolveProjectCwd` is tested via direct input→output assertion (pure function boundary).
- `sessions.open()` cwd threading is tested at the `Bun.spawn` boundary, which is the lowest observable integration point without actually spawning zellij.
- No internal function names, file paths, or library-specific error strings are hard-coded in the assertions.

## Verdict summary
PASS on all 4 rubric items. The two new spec-036 tests correctly fail on the current implementation (RED state verified). The smoke script also exits 1 on the current code. The gate is well-shaped for its intent. Touching .gate-frozen.
