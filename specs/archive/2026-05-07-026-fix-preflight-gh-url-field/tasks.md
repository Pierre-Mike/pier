# Tasks

- [x] 1. Extend smoke (RED): rename stub JSON `htmlUrl` → `url`, add `ALLOWED_GH_FIELDS` + Case D contract check
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-preflight-main-ci.ts]
  - boundary: [scripts/smoke-preflight-main-ci.ts]
- [x] 2. Apply fix: rename `htmlUrl` → `url` in preflight script (interface, argv, error log)
  - agent: main
  - depends: [1]
  - file_targets: [scripts/preflight-main-ci.ts]
  - boundary: [scripts/preflight-main-ci.ts]
