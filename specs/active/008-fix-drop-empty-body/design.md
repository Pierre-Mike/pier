# Design

## Approach

One-line fix in `handleOSFileDrop` in `apps/frontend/src/dashboard/drop.ts`.

Hono's `hc` client serialises `form:` by calling `Object.entries(args.form)`. A `FormData` instance has no enumerable own keys, so `Object.entries(fd)` yields `[]` — the body ships empty. Passing a plain object `{ files: File[] }` instead makes hc iterate the array and append each `File` under the `"files"` key.

## Files touched

- `apps/frontend/src/dashboard/drop.ts` — replace `new FormData() / for…fd.append(...) / form: fd` block with `form: { files }` in `handleOSFileDrop`
- `apps/frontend/src/dashboard/drop.test.ts` — add runtime test (spec 008 gate)
- `apps/frontend/package.json` — add `happy-dom` devDependency for DOM test environment

## Decisions

- **Stub `globalThis.fetch`, not the `api` module** — mocking the `api` module would bypass hc's `Object.entries(form)` path and miss the bug entirely. Intercepting at the `fetch` boundary lets hc's serialisation run and exposes the empty-body failure.
- **`GlobalWindow` from happy-dom** — Bun's test runner has no built-in DOM; happy-dom provides `document`, `DataTransfer`, `File`, `FormData`, and `MouseEvent` needed to drive `wireTerminalDrop()` via a synthetic drop event.
- **`MouseEvent` + `Object.defineProperty` for `dataTransfer`** — happy-dom's `DragEvent` constructor ignores the `dataTransfer` init option, so the DataTransfer is injected post-construction via `defineProperty`.
- **Inspect `init.body` directly** — the fetch stub captures `init.body` as a `FormData` and calls `getAll("files")` to count entries. Constructing a `new Request(url, init)` loses the boundary information needed for `.formData()` parsing.

## Risks

- happy-dom version drift: pinned to `^20.9.0`, same version used by the repo-browser worktree. The `GlobalWindow` export is stable across minor versions.
- The `store.activeProject` validator requires the session to be in `sessions` first. Test sets `store.sessions.set("p", ...)` before `store.activeProject = "p"` to satisfy the invariant.

## Out of scope

- Backend changes — the route already accepts `files[]` multipart correctly.
- Any other call sites for `api.$post` with form data — there are none.
