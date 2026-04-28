# Tester review — 008 (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES
Mapping:
  - AC1 (drop yields `formData().getAll("files").length === 1`) → `drop.test.ts` test "drop event ships files in multipart body", line 221 ✓
  - AC2 (entry `.name` matches original `File.name`) → same test, line 225 ✓
  - AC3 (six spec-007 source-inspection tests still pass) → tests 1-6 retained verbatim in same file ✓

The runtime assertion observes `capturedBody` extracted from the `fetch` stub's `init.body` — i.e., the FormData materialised **after** hc's `Object.entries(args.form)` serialiser executed. This is the load-bearing seam the spec demands.

### 2. Adversarial gap
NO (searched, found none material)
- Buggy `form: fd` still in place → hc's `Object.entries(fd)` yields `[]` → `getAll("files").length === 0` → test fails. Cannot pass with bug.
- Mocking `./api` to bypass hc → smoke gate's `\bform:\s*\{\s*files\s*\}\b` regex on `drop.ts` would still fail. Closed by the dual-gate setup.
- `fetch` stub only captures when `body instanceof FormData`; alternative wrappings would leave `capturedBody` null and trip `expect(capturedBody).not.toBeNull()`. Safe.

### 3. Coverage gap
NO
All ACs covered. Multi-file drop is flagged optional in the brief and not in the AC list. Clipboard/injected branching from spec 007 is covered by tests 1-6, which the runtime test does not interfere with (the fetch stub returns `injected: true` and no clipboard mock leaks into the success path).

### 4. Behavior vs implementation detail
YES (tests behavior-pinned at the seam)
The runtime test asserts on `Request.body` at the fetch boundary — pure observable behaviour. No hc internals imported, no `rBody` introspection, no form-key-order assumption (uses `getAll("files")`). The smoke gate is intentionally string-grep on `drop.ts` (the brief acknowledges this as a fast secondary gate); the primary unit gate is behaviour-pinned.

## Verdict summary
PASS. The unit gate drives `wireTerminalDrop()` end-to-end via a synthetic drop event and observes the captured `FormData` body after hc serialisation, directly catching the `Object.entries(FormData) === []` bug. Both ACs are mapped to runtime assertions; spec-007 contracts are preserved; no adversarial gaps remain after the smoke gate closes the api-mocking workaround.
