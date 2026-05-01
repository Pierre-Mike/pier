# Tester review — 019-global-drop-app-folder (attempt 1)

**Verdict**: PASS

## Rubric

### 1. Acceptance criterion coverage
YES

Mapping:
- AC 1 (POST returns `{name,path,size,injected}` rooted under `<appRoot>/drops/`) → `POST /api/drops > returns 200 with saved path under <appRoot>/drops/ and injected boolean` ✓
- AC 2 (writeChars with shell-quoted path + trailing space) → `calls writeChars with shell-quoted path and trailing space — file name with spaces` and `... unquoted path and trailing space — safe file name` ✓
- AC 3 (file name with spaces → single-quoted shell text) → `calls writeChars with shell-quoted path and trailing space — file name with spaces` ✓
- AC 4 (two files → single writeChars call, space-joined, trailing space) → `calls writeChars once with both paths joined — two files, second has spaces` ✓
- AC 5 (missing `activeProjectId` → 400 `{error:"no active project"}`) → `returns 400 when activeProjectId is missing` ✓
- AC 6 (writeChars → `{injected:false}` still 200 with `injected:false` in payload) → `returns 200 with injected: false when writeChars returns injected: false` ✓
- AC 7 (GET sorted newest-first with `{name,path,size,mtime}`) → `GET /api/drops > returns an array sorted newest-first ...` + repo `listDropped returns entries sorted newest-first` ✓
- Contract: `DropsService` Effect Context tag with `saveDropped`/`listDropped` → `drops.repo.test.ts > DropsService tag is exported` + `makeDropsServiceTest saves ...` + `... listDropped returns ...` ✓

### 2. Adversarial gap
YES

The GET route test (`drops.routes.test.ts`) is wired with `ConfigTest` but does not seed any drops files before issuing the GET. An implementation that returns `[]` from `dropsGetHandler` regardless of folder contents would pass: the for-loops over `json` are vacuous on an empty array, the sort-order check is vacuous, and the shape checks never run. Mitigated (not eliminated) by `drops.repo.test.ts` exercising `listDropped` against `makeDropsServiceTest` with seeded fixtures, which does verify substantive ordering and shape at the repo layer. Acceptable because the repo gate carries the semantic load and the routes gate functions as a wiring smoke test, but worth naming.

Secondary: AC 1 path assertion uses only `/drops/` substring + `not .pier/drops`. An implementation that saves to `<anything>/drops/<projectId>/file` would pass. Minor — the constraint "rooted under `<appRoot>/drops/`" is partially encoded but not strictly anchored to the resolved appRoot.

### 3. Coverage gap
YES

Testable properties present in `Constraints` but not in `Acceptance criteria` and uncovered:
- 100 MB per-file cap → 400 (constraint line, no test asserts an oversized file is rejected).
- `PIGUY_APP_ROOT` env override and marker-walk fallback for `appRoot` resolution (no test pins the resolution policy).
- Removal of `POST /api/projects/:id/drop` (no test asserts the old route is gone, e.g., 404 on the legacy path).

These are not in the AC list, so they do not block PASS, but they are testable properties in the intent surface. Recording them so a future regression on the cap, env override, or zombie route is visible.

### 4. Behavior vs implementation detail
YES — tests behavior-pinned

Couplings to named exports `dropsPostHandler`, `dropsGetHandler`, `dropsRoute`, `DropsService`, `makeDropsServiceTest` are gate-defined contract symbols (the spec requires `DropsService` as a Context tag), not incidental implementation detail. Assertions target HTTP status codes, JSON body shapes, captured `writeChars` arguments, and Effect-returned record shapes — all observable behavior. No hard-coded internal paths beyond `/drops/` substring (which is the spec contract).

## Verdict summary

PASS. All 7 acceptance criteria map to concrete tests across the routes and repo gates. The `DropsService` Context-tag contract is enforced by the repo gate. Adversarial gap on the GET route smoke test (vacuous on empty fixture) is structurally mitigated by the repo gate's seeded `listDropped` assertions, so not a structural blocker. Coverage gaps for 100 MB cap, env-override, and legacy-route removal are constraint-level (not AC-level) and acceptable. Tests are behavior-pinned.
