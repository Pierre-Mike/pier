# Tester review — 046-fix-zellij-socket-timeout (attempt 1)

**Verdict**: FAIL

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC 1 → `"open(projectId) succeeds when cwd does not exist (cwd is pre-created)"` (unit, line 540) + `"POST /api/sessions succeeds for non-existent project cwd..."` (integration, line 67) ✓
- AC 2 → `"socket poll timeout is extended or adaptive for non-existent cwd"` (unit, line 554) ✓
- AC 3 → `"timeout error message includes cwd path and existence status"` (unit, line 584) + `"timeout error response includes actionable context"` (integration, line 84) ✓
- AC 4 → process constraint (existing tests pass); not testable by new gate tests ✓
- AC 5 → process constraint (existing tests pass); not testable by new gate tests ✓
- AC 6 → new RED tests exist in both gate files ✓

### 2. Adversarial gap
YES — gap found

The AC1 unit test uses mock `Bun.spawn` that writes fake sockets immediately (lines 497-509). The test passes regardless of whether the implementation actually creates the cwd directory on disk. An implementer could:
1. Do nothing new
2. Rely on the mock to always succeed
3. Never pre-create the cwd

Result: all tests pass while violating "cwd is created" intent.

### 3. Coverage gap
YES

1. **AC1 missing disk verification**: Test doesn't assert `existsSync(join(tmpRoot, "missing-cwd-project"))` after `sessions.open` completes. No test verifies the cwd was actually created.

2. **AC3 missing "exists: true" pattern**: Lines 615-619 check for `"does not exist"`, `"directory not found"`, `"cwd exists: false"`, `"missing"`. Per design.md, if cwd is pre-created before spawn, a subsequent timeout would report `"cwd exists: true"`. That pattern isn't matched—correct implementations would fail this test.

### 4. Behavior vs implementation detail
NO — implementation-detail coupling detected

AC2 test (lines 561-579) reads source and anchors on:
```typescript
spawnNamedSessionBody?.indexOf("for (let i = 0; i < 30")
```

This couples to:
- Specific loop construct (`for` vs `while`)
- Specific counter variable name (`i`)
- Specific literal constant (`30`)

A semantically correct refactor (e.g., `while (attempts < maxAttempts)`) would break the test despite preserving behavior.

## Verdict summary

FAIL. Three items need correction:

| Item | Issue | Expected correction |
|------|-------|---------------------|
| 2 | Mock bypasses cwd-creation verification | After `sessions.open("missing-cwd-project")`, assert the cwd directory exists on disk |
| 3 | AC3 test rejects "exists: true" pattern | Add `"cwd exists: true"` or `"exists:"` to the pattern alternatives |
| 4 | AC2 test anchors on loop syntax | Remove structural source-reading for timeout check; verify behavior via observable outcome (e.g., session succeeds when cwd didn't exist, proving pre-creation or tolerance) |
