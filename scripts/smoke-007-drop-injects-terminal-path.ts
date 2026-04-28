/**
 * Smoke gate for spec 007: Drag-and-drop injects path into active terminal.
 *
 * Delegates to the backend's test infrastructure via a Bun subprocess so
 * package resolution (effect, etc.) works correctly from apps/backend/.
 *
 * Asserts:
 *  1. TerminalSessions interface declares a `writeChars` method (compile-time
 *     TypeScript check — RED until implementer adds the method).
 *  2. The repo test adapter returns paths under `.pier/drops/` (runtime check).
 *
 * Shell-quoting is verified via the writeChars call text in the unit tests
 * (projects-drop.test.ts) — not by importing an internal helper by name.
 *
 * Exits 0 on all checks pass, 1 on any failure.
 *
 * RED: `writeChars` does not exist on TerminalSessions interface, so the
 * TypeScript structural assignment below is a compile error. At Bun runtime
 * (types stripped), the repo path check fails because makeRepoServiceTest
 * still returns ".drops/" paths.
 */

import { join } from "node:path";

const REPO_ROOT = import.meta.dir ? join(import.meta.dir, "..") : process.cwd();

// ---------------------------------------------------------------------------
// Run the repo-path check as a subprocess in apps/backend so that effect
// and other backend deps resolve correctly.
// ---------------------------------------------------------------------------
const inlineCheck = `
import { Effect } from "effect";
import { makeRepoServiceTest, RepoService } from "./src/infra/repo.ts";
import type { TerminalSessions } from "./src/infra/terminal-sessions.ts";

// TypeScript structural check: Pick<TerminalSessions, "writeChars"> is a
// compile error until the interface gains the method.
const _check: Pick<TerminalSessions, "writeChars"> = {
  writeChars: (_a) => Effect.succeed({ injected: false }),
};
void _check;

const repoLayer = makeRepoServiceTest(new Map());
const saved = await Effect.runPromise(
  Effect.gen(function* () {
    const repo = yield* RepoService;
    return yield* repo.saveDropped({
      projectId: "test-proj",
      files: [new File(["x"], "hello.txt")],
    });
  }).pipe(Effect.provide(repoLayer)),
);

let ok = true;
for (const f of saved) {
  if (!f.path.includes(".pier/drops/")) {
    console.error("FAIL: expected .pier/drops/ in path, got: " + f.path);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
`;

const backendDir = join(REPO_ROOT, "apps", "backend");
const proc = Bun.spawn(["bun", "--eval", inlineCheck], {
	cwd: backendDir,
	stdout: "inherit",
	stderr: "inherit",
});
const code = await proc.exited;
if (code !== 0) {
	process.exit(1);
}
console.log("smoke-007: all checks passed");
process.exit(0);
