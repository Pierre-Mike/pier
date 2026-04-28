## Approach

Create `.pi/extensions/claude-hooks-compat.ts` as a native Pi extension. Keep pure guard and trace helpers exported for unit and integration tests. Register `tool_call` for hard pre-execution blocks and `tool_result` for advisory post-write verification.

## Files touched

- `.pi/extensions/claude-hooks-compat.ts`
- `.pi/extensions/claude-hooks-compat.test.ts`
- `.pi/extensions/claude-hooks-compat.integration.test.ts`

## Decisions

- Use project-local extension scope.
- Duplicate small pure guard logic rather than invoking Claude's stdin dispatcher.
- Keep post-tool verification non-blocking.
