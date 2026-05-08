# Design

## Approach

Remove the directory-existence check from `resolveProjectCwd`. The function currently does `stat(join(root, projectId))` and falls back to `root` when that stat fails. The fix is to unconditionally return `join(root, projectId)`. This is a 3-line change to one function.

The unit test file (`sessions.repo.test.ts`) has an existing spec-023 test asserting the old fallback: "returns `<projectsRoot>` when `<projectId>` directory does not exist". That test must also be updated to assert the new contract (`join(root, projectId)`).

## Files touched

- `apps/backend/src/features/sessions/sessions.repo.ts` — simplify `resolveProjectCwd` to always return `join(projectsRoot, projectId)`; remove `stat` call and try/catch
- `apps/backend/src/features/sessions/sessions.repo.test.ts` — update spec-023 fallback test to assert new contract

## Decisions

- **Remove stat entirely** — no need to check if directory exists; zellij will spawn with that cwd regardless. If the directory doesn't exist, zellij creates a root pane at `/` anyway (OS-level behavior). The user's intent is unambiguous: cwd must be the project folder path.
- **Keep `openDefault()` unchanged** — it uses `config.projectsRoot` directly, which is correct (the default session is not project-scoped).
- **No mkdir** — we don't auto-create the directory; that's out of scope.

## Risks

- If zellij can't spawn with a non-existent cwd path, it may error. Current behavior silently swallows spawn errors via `Effect.orElseSucceed`, so regression risk is low.

## Out of scope

- Auto-creating the project directory.
- Changing `openDefault()` cwd.
- Changing the zellij socket dir or spawn arguments beyond cwd.
