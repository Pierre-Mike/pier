# Design

## Approach

Three targeted one-liner fixes at the page-composition layer, plus one new
DOM-level test in `files.test.ts`.

## Files touched

- `apps/frontend/src/dashboard/files.ts` — add `renderFileTree()` call at the
  end of `refreshFiles`, after `await fetchFolderChildren(projectId, "")`.

- `apps/frontend/src/pages/index.astro` — two changes in `wirePaletteUI()`:
  1. Add `fetchFileResults` to the `installPalette({…})` call. The arrow
     function uses `(api as any).api.projects[":id"].files.search.$get(…)` with
     `store.activeProject` as the project id, maps the response to
     `PaletteEntry[]`, and honours the `AbortSignal`.
  2. Remove `files: store.files` from the `getStore()` return value
     (`StoreSnapshot` has no `files` field since spec 041).

- `apps/frontend/src/dashboard/files.test.ts` — new `describe("spec 042: …")`
  block: patches `globalThis.fetch` to return fake root-level entries, calls
  `refreshFiles("test-project")`, and asserts `#file-tree` renders at least one
  `.tree-file` element (not just the empty-placeholder div).

## Decisions

- **No module mocking** — `fetchFolderChildren` uses the `api` Hono client
  which calls `fetch` internally. Patching `globalThis.fetch` in the test is
  simpler than ES-module monkey-patching and avoids a test-helper dependency.

- **fetchFileResults abort-awareness** — pass the `AbortSignal` from the
  `AbortController` to the `$get` call's `init` option so in-flight requests
  are cancelled when the palette closes or a new query supersedes the old one.

- **Return `[]` on null activeProject** — `palette.ts` calls `fetchFileResults`
  only when a query exists; still, we guard against a null activeProject to
  avoid a route call with a literal `:id` param.

## Risks

- The Hono typed client's `.search` sub-path may require a cast to `any` (as
  already done for other file-tree calls) because the deep inference falls back
  to `unknown`. This is pre-existing and documented in `api.ts`.

## Out of scope

- Debounce logic inside `fetchFileResults` — `palette.ts` already debounces the
  call at 150ms with its own `AbortController`.
- Any changes to the backend search route.
- Any other sidebar or palette behaviour not listed in the acceptance criteria.
