# Design

## Approach

Add three lines to `lefthook.yml` defining a `post-merge` hook that runs `bun scripts/worktree-close.ts` (no args → auto-sweep over every merged `spec/*` branch). The auto-sweep code path is already battle-tested — it's the same code paths that I've been invoking manually four times today. Add a hermetic two-part smoke: (1) lefthook.yml contains the expected block, (2) the underlying entrypoint exits 0 with the expected "no merged spec branches" message when there are no merged branches to sweep.

## Files touched

- `lefthook.yml` — append a `post-merge:` block.
- `scripts/smoke-post-merge-sweep-hook.ts` — new gate.

## Decisions

- **Auto-sweep mode (no args), not single-slug** — the post-merge hook fires on `git pull` regardless of which spec just merged, so the hook can't know which slug to target. `worktree-close.ts` (no args) already iterates merged branches and closes each.
- **Run via `bun`, not `bunx`** — the script is a checked-in source file, not a published package; `bun scripts/worktree-close.ts` is the consistent invocation pattern used throughout the repo (see `prepare`, `tasks:verify`, etc.).
- **Hermetic smoke, no real lefthook firing** — testing the actual hook firing would require installing lefthook into a tmp repo, copying the config, and triggering a merge event. The contract layer (lefthook.yml has the block) plus the entrypoint health check (script runs cleanly with no merged branches) covers the regression class. End-to-end verification happens out-of-band on the next /retro.
- **One-time `bun install` requirement, documented** — lefthook only registers new hooks during `lefthook install`, which runs through the root `prepare` script during `bun install`. After this PR merges, the user runs `bun install` once and the post-merge hook is wired forever.

## Risks

- The user forgets to `bun install` after merging, hook stays unregistered, the gap persists silently. Mitigation: `findings.md` for the next retro will surface it (worktree still hanging around) and prompt the install.
- `worktree-close.ts` auto-sweep on every `git pull` adds one second of latency. Acceptable — the script is fast-path when there are no merged spec branches (single `gh pr list` call returning empty).
- A `git pull` triggered on a spec branch (not main) would also fire post-merge. The script handles this gracefully — it lists `spec/*` branches and closes only those that are merged into main; the current branch (whichever it is) is not touched unless its branch IS merged. Worst case, the user pulls into their spec branch after their own PR merged and the script offers to close it — desired behaviour.

## Out of scope

- Touching `worktree-close.ts` itself. Already correct.
- Pre-merge hook to validate worktree state. Different problem.
- Cron-based sweep. Hook-driven sweep covers the local case; CI doesn't run worktrees.
