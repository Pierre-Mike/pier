/**
 * Smoke gate for spec 007: Drag-and-drop injects path into active terminal.
 *
 * Asserts:
 *  1. TerminalSessions interface declares a `writeChars` method.
 *  2. The repo test adapter returns paths under `.pier/drops/`.
 *  3. `shellQuote` is exported from the backend drop route (server-side quoting).
 *
 * Exits 0 on success, 1 on any failure.
 *
 * RED: `writeChars` does not exist on TerminalSessions yet, and `shellQuote`
 * is not exported from projects-drop.ts — imports below will throw until
 * the implementer adds both.
 */

import { Effect } from "effect";
import { makeRepoServiceTest, RepoService } from "../apps/backend/src/infra/repo.ts";
import type { TerminalSessions } from "../apps/backend/src/infra/terminal-sessions.ts";
// shellQuote will be exported from the route once implemented — RED until then
import { shellQuote } from "../apps/backend/src/shell/routes/projects-drop.ts";

let failed = false;
const fail = (msg: string): void => {
	console.error(`FAIL: ${msg}`);
	failed = true;
};

// 1. Verify writeChars is declared on the interface via a structural assignment.
//    Pick<TerminalSessions, "writeChars"> is a compile error until the interface
//    gains the method — that is the intended RED.
const _checkWriteChars: Pick<TerminalSessions, "writeChars"> = {
	writeChars: (_args: { projectId: string; text: string }) => Effect.succeed({ injected: false }),
};
if (typeof _checkWriteChars.writeChars !== "function") {
	fail("TerminalSessions.writeChars is not a function");
}

// 2. Verify repo test adapter paths use .pier/drops/
const repoLayer = makeRepoServiceTest(new Map());
const savedFiles = await Effect.runPromise(
	Effect.gen(function* () {
		const repo = yield* RepoService;
		return yield* repo.saveDropped({
			projectId: "test-proj",
			files: [new File(["x"], "hello.txt")],
		});
	}).pipe(Effect.provide(repoLayer)),
);

for (const f of savedFiles) {
	if (!f.path.includes(".pier/drops/")) {
		fail(`expected .pier/drops/ in path, got: ${f.path}`);
	}
}

// 3. Verify shellQuote produces correct output
const quotedSimple = shellQuote("/abs/path/file.txt");
if (quotedSimple !== "/abs/path/file.txt") {
	fail(`shellQuote simple: expected '/abs/path/file.txt', got '${quotedSimple}'`);
}
const quotedSpaced = shellQuote("/abs/path/my file.txt");
if (quotedSpaced !== "'/abs/path/my file.txt'") {
	fail(`shellQuote spaced: expected "'/abs/path/my file.txt'", got '${quotedSpaced}'`);
}
const quotedSingleQuote = shellQuote("/path/it's here.txt");
if (!quotedSingleQuote.includes("'\\''")) {
	fail(`shellQuote with embedded single quote not escaped: got '${quotedSingleQuote}'`);
}

if (failed) {
	process.exit(1);
}
console.log("smoke-007: all checks passed");
process.exit(0);
