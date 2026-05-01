# Tasks

This is a `kind: writeup` umbrella spec. The plan was approved and the migration was carried out via subsequent specs. This single task tracks completion of the writeup itself.

- [x] 1. Approve and freeze the feature-slice plan
  - agent: main
  - depends: []
  - file_targets: [specs/active/011-backend-feature-slice-plan/design.md]
  - boundary: [specs/active/011-backend-feature-slice-plan/**]

The substantive migration landed across follow-up specs and pre-spec commits. Current backend layout (`apps/backend/src/features/<name>/`, `apps/backend/src/platform/`, `apps/backend/src/api.ts`) matches the target layout in `design.md` §2.
