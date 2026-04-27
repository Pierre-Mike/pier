# Tasks

Ordered checklist. Each task declares its `agent`, `depends`, `file_targets`,
and `boundary`.

- `file_targets` is the set of files the task INTENDS to touch — `spec-complete.ts`
  uses it to tick the box when those exact paths are modified.
- `boundary` is the set of glob patterns the task is ALLOWED to touch.

Note: this spec is authored under the CURRENT batch model — tasks.md does NOT
use per-task `gate:` fields (that's the shape this spec is adding).

- [x] 1. Add `findSliceForPath` to `.claude/hooks/enforce.ts`
  - agent: main
  - depends: []
  - file_targets: [.claude/hooks/enforce.ts]
  - boundary: [.claude/hooks/enforce.ts]
- [x] 2. Wire `findSliceForPath` into the pre-tool-use guard and remove old `.gate-frozen` lookup
  - agent: main
  - depends: [1]
  - file_targets: [.claude/hooks/enforce.ts]
  - boundary: [.claude/hooks/enforce.ts]
- [x] 3. Update `scripts/spec-lint.ts` to validate per-task `gate:` shape
  - agent: main
  - depends: [4]
  - file_targets: [scripts/spec-lint.ts]
  - boundary: [scripts/spec-lint.ts, scripts/_lib.ts]
- [x] 4. Update `scripts/_lib.ts` — add `taskGates` helper and update `gateEntries` for per-task gate iteration
  - agent: main
  - depends: []
  - file_targets: [scripts/_lib.ts]
  - boundary: [scripts/_lib.ts]
- [x] 5. Update `scripts/tasks-verify.ts` to be slice-aware (skip unfrozen slices)
  - agent: main
  - depends: [4]
  - file_targets: [scripts/tasks-verify.ts]
  - boundary: [scripts/tasks-verify.ts]
- [x] 6. Update `scripts/spec-complete.ts` to require all sentinels + all gates green
  - agent: main
  - depends: [4]
  - file_targets: [scripts/spec-complete.ts]
  - boundary: [scripts/spec-complete.ts]
- [x] 7. Rewrite `.claude/skills/do/SKILL.md` Steps 5–6 (scaffold + slice loop), update Step 2.5 dispatch pseudocode
  - agent: main
  - depends: [1, 2, 3, 4, 5, 6]
  - file_targets: [.claude/skills/do/SKILL.md]
  - boundary: [.claude/skills/do/SKILL.md]
- [x] 8. Update `.claude/agents/spec-tester.md` for per-slice scope
  - agent: main
  - depends: [7]
  - file_targets: [.claude/agents/spec-tester.md]
  - boundary: [.claude/agents/spec-tester.md]
- [x] 9. Update `.claude/agents/spec-judge.md` for per-slice review (`tester-review-<N>.md`, `.gate-frozen-<N>`)
  - agent: main
  - depends: [7]
  - file_targets: [.claude/agents/spec-judge.md]
  - boundary: [.claude/agents/spec-judge.md]
- [x] 10. Update `.claude/agents/spec-implementer.md` for per-slice implementation
  - agent: main
  - depends: [7]
  - file_targets: [.claude/agents/spec-implementer.md]
  - boundary: [.claude/agents/spec-implementer.md]
- [x] 11. Update `specs/_template/proposal.md` and `specs/_template/tasks.md` for new gate shape
  - agent: main
  - depends: [3, 4]
  - file_targets: [specs/_template/proposal.md, specs/_template/tasks.md]
  - boundary: [specs/_template/**]
- [x] 12. Update `specs/constitution.md` §4 to reflect per-task gate field
  - agent: main
  - depends: [3, 4]
  - file_targets: [specs/constitution.md]
  - boundary: [specs/constitution.md]

Task box ticking happens via `scripts/tasks-verify.ts`, not manually.
