# Design

## Approach

Inside the `for…of` loop in `renderSessions()` (~line 167 of `projects.ts`), add one
`addEventListener("contextmenu", …)` call — mirroring the identical block already present
in `renderProjects()` at lines 139–142.

```ts
li.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    void openProjectContextMenu({ id: pid, x: ev.clientX, y: ev.clientY });
});
```

No other changes required.

## Files touched

- `apps/frontend/src/dashboard/projects.ts` — add contextmenu listener in `renderSessions()`

## Decisions

- **Reuse `openProjectContextMenu` as-is** — no extraction; the function already handles
  fetch, null-url toast, and `window.open`. Repeating the same wiring pattern is
  intentional symmetry.
- **No new helper** — extracting a shared "wire contextmenu" helper would touch more lines
  for zero gain; rejected.

## Risks

- None. The function path is already exercised by `renderProjects()` in production.

## Out of scope

- Context menu items beyond "Open on GitHub" (e.g., "Copy URL", "Close session").
- Any changes to `openProjectContextMenu` signature or behavior.
- Backend changes.
