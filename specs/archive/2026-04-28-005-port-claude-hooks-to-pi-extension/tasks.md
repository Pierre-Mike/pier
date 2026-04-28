# Tasks

- [x] 1. Implement Pi-native hook compatibility extension
  - agent: main
  - depends: []
  - file_targets: [.pi/extensions/claude-hooks-compat.ts]
  - boundary: [.pi/extensions/claude-hooks-compat.ts]
  - gate: .pi/extensions/claude-hooks-compat.integration.test.ts

- [x] 2. Add unit gate for pure guard behavior
  - agent: main
  - depends: []
  - file_targets: [.pi/extensions/claude-hooks-compat.test.ts]
  - boundary: [.pi/extensions/claude-hooks-compat.test.ts]
  - gate: .pi/extensions/claude-hooks-compat.test.ts

- [x] 3. Add integration gate for extension event registration and trace behavior
  - agent: main
  - depends: [1]
  - file_targets: [.pi/extensions/claude-hooks-compat.integration.test.ts]
  - boundary: [.pi/extensions/claude-hooks-compat.integration.test.ts]
  - gate: .pi/extensions/claude-hooks-compat.integration.test.ts
