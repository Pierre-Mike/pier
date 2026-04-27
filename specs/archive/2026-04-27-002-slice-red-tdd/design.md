# Design — 002 Convert /do from batch-RED to slice-RED TDD

## Approach

### Slice loop replaces single dispatch

The current flow sends spec-tester once to author all gate files, then spec-judge reviews them all, then spec-implementer makes them all green. The new flow sends spec-tester once per task slice: author one gate file, spec-judge reviews it, spec-implementer makes it green, then repeat for the next slice. The scaffold step (proposal + design + tasks) is emitted once, up-front, without any gate files. `tasks.md` ships a best-effort ordered slice list; between cycles spec-tester may append or split future slices but never rewrites past slices.

### Per-slice sentinel

Each task slice is guarded by a `.gate-frozen-<N>` file in the spec directory (where N is the 1-based task index). The spec-judge creates this file after approving slice N's gate. `enforce.ts` uses it to block writes to that slice's gate path. The old single `.gate-frozen` sentinel is removed entirely.

### Hook gains gate-path lookup

`enforce.ts` gains a new exported pure function `findSliceForPath({ filePath, repoRoot })`. On every Write/Edit the hook calls this function: it reads the active spec's `tasks.md`, finds the task whose `gate:` field equals the write target, and checks whether `.gate-frozen-<N>` exists. If found and frozen → block. The lookup is O(tasks × specs); small counts, no caching.

```
write to <path>
  → findSliceForPath({ filePath: <path>, repoRoot })
    → no task has gate:<path>           → { null }    → allow
    → task[N] has gate:<path>
        → .gate-frozen-N exists         → { frozen: true }  → BLOCK
        → .gate-frozen-N missing        → { frozen: false } → allow
```

### Script updates

- **`scripts/_lib.ts`**: `gateEntries` updated to also parse task-level `gate:` fields; new `taskGates` helper iterates tasks and yields `{ taskIndex, gatePath, frozen }`.
- **`scripts/spec-lint.ts`**: validates that every task has a `gate:` field, gate paths are unique across tasks, and slice indices are contiguous from 1.
- **`scripts/tasks-verify.ts`**: slice-aware — for each gate entry, check if `.gate-frozen-<N>` exists before running the gate. If no sentinel → skip (not yet in scope). Partial green is the normal mid-spec state.
- **`scripts/spec-complete.ts`**: precondition added — every task must have a `.gate-frozen-<N>` sentinel AND every gate must run green.

### Agent doc updates

- `spec-tester.md`: per-slice scope; one gate file per invocation; `tester-review-<N>.md` per slice.
- `spec-judge.md`: reviews one slice at a time; writes `tester-review-<N>.md`; creates `.gate-frozen-<N>`.
- `spec-implementer.md`: implements one slice at a time; stuck cap per slice.
- `do/SKILL.md`: step 5 is scaffold-only (no gate files, commit `spec(<id>): scaffold — <title>`); step 6 is the per-slice loop.

## Files touched

| File | Change |
|---|---|
| `.claude/hooks/enforce.ts` | Add `findSliceForPath` export; wire into pre-tool-use guard; remove old `.gate-frozen` check |
| `scripts/_lib.ts` | Update `gateEntries`; add `taskGates` helper |
| `scripts/spec-lint.ts` | Validate per-task `gate:` field, uniqueness, contiguous indices |
| `scripts/tasks-verify.ts` | Slice-aware gate execution (skip unfrozen slices) |
| `scripts/spec-complete.ts` | Require all sentinels + all gates green |
| `.claude/skills/do/SKILL.md` | Steps 5–6 rewritten; step 2.5 dispatch pseudocode updated |
| `.claude/agents/spec-tester.md` | Per-slice scope, `tester-review-<N>.md` |
| `.claude/agents/spec-judge.md` | Per-slice review, `.gate-frozen-<N>` |
| `.claude/agents/spec-implementer.md` | Per-slice implementation |
| `specs/_template/proposal.md` | Gate shape unchanged (list form already correct) |
| `specs/_template/tasks.md` | Add per-task `gate:` field to template and docs |
| `specs/constitution.md` | §4 updated to document per-task gate field |

## Decisions

### 1. Slice planning — Hybrid

`tasks.md` ships a best-effort slice list at scaffold time. Between slice cycles, spec-tester is permitted to append, split, or rewrite **future** slices in `tasks.md`, but never past slices (frozen by sentinel + commit history). Judge at scaffold-time only validates that slice 1 maps to acceptance criteria; downstream slices reviewed when authored.

### 2. Mid-spec slice failure — Draft-PR the whole branch

Even though slices 1..N-1 may be committed green, spec is one logical unit (one proposal, one acceptance-criteria set). Partial PR would archive a spec whose ACs aren't met. Draft PR surfaces the failure for human review without polluting `main`.

### 3. Hook freeze logic — gate-path → slice-index lookup

On every Write/Edit, the hook parses the active spec's `tasks.md`, finds the task whose `gate:` equals the write target, blocks if `.gate-frozen-<N>` exists for that task index. Lookup is O(tasks) per write; small task counts, no caching needed.

## Out of scope

- Migration of in-flight specs: no in-flight specs exist at the time this spec lands.
- Backward compatibility for old single `.gate-frozen` sentinel: clean break since no archived specs depend on it.
- Parallelising slice cycles across specs: the slice loop is per-spec and sequential within a spec.
