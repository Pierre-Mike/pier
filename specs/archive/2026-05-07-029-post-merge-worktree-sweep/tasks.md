# Tasks

- [x] 1. Author the gate (RED): hermetic smoke for the post-merge contract and entrypoint health
  - agent: main
  - depends: []
  - file_targets: [scripts/smoke-post-merge-sweep-hook.ts]
  - boundary: [scripts/smoke-post-merge-sweep-hook.ts]
- [x] 2. Apply fix: add `post-merge:` block to lefthook.yml
  - agent: main
  - depends: [1]
  - file_targets: [lefthook.yml]
  - boundary: [lefthook.yml]
