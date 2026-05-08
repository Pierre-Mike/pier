#!/usr/bin/env bun

// smoke-pr-merge-auto.ts
// spec 032 workflow gate: prove that scripts/pr-merge-auto.ts surfaces the
// auto-merge race deterministically — printing one of two single-line
// outcomes (queued / NOT QUEUED) instead of leaking gh's GraphQL message.

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const WRAPPER = join(REPO_ROOT, "scripts", "pr-merge-auto.ts");

const QUEUED_MARKER = "✓ auto-merge queued";
const NOT_QUEUED_MARKER = "✖ AUTO-MERGE NOT QUEUED";

interface StubArgs {
	readonly dir: string;
	readonly mergeStdout: string;
	readonly mergeStderr: string;
	readonly mergeCode: number;
	readonly viewJson: string;
}

// Build a bash gh-stub that branches on argv. `gh pr merge ...` returns
// configured (stdout, stderr, exit code). `gh pr view ... --json
// autoMergeRequest` returns the configured viewJson. Anything else exits 1.
function buildStub({ dir, mergeStdout, mergeStderr, mergeCode, viewJson }: StubArgs): string {
	const path = join(dir, "gh-stub");
	// Use printf-style escaping; viewJson passed as literal JSON.
	const script = `#!/usr/bin/env bash
case "$1 $2" in
  "pr merge")
    echo '${mergeStdout.replace(/'/g, "'\\''")}'
    echo '${mergeStderr.replace(/'/g, "'\\''")}' >&2
    exit ${mergeCode}
    ;;
  "pr view")
    echo '${viewJson.replace(/'/g, "'\\''")}'
    exit 0
    ;;
  *)
    echo "stub: unexpected gh args: $@" >&2
    exit 1
    ;;
esac
`;
	writeFileSync(path, script);
	chmodSync(path, 0o755);
	return path;
}

async function runWrapper(
	stubPath: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", WRAPPER, "12345"], {
		env: {
			...process.env,
			PIER_PR_MERGE_GH_BIN: stubPath,
			// Shrink the 10s poll window so the smoke runs fast.
			PIER_PR_MERGE_TIMEOUT_MS: "500",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { code, stdout, stderr };
}

const tmp = mkdtempSync(join(tmpdir(), "smoke-032-"));
mkdirSync(join(tmp, "queued"), { recursive: true });
mkdirSync(join(tmp, "rejected"), { recursive: true });

// Case A — queued: gh merge succeeds (exit 0, no stderr noise) and
// `gh pr view` reports a non-null autoMergeRequest. Wrapper prints
// "✓ auto-merge queued ..." and exits 0.
const stubQueuedPath = buildStub({
	dir: join(tmp, "queued"),
	mergeStdout: "",
	mergeStderr: "",
	mergeCode: 0,
	viewJson: '{"autoMergeRequest":{"enabledAt":"2026-05-08T00:00:00Z"}}',
});

const caseA = await runWrapper(stubQueuedPath);
if (caseA.code !== 0) {
	console.error(`FAIL case A (queued): exit ${caseA.code}`);
	console.error("stdout:", caseA.stdout);
	console.error("stderr:", caseA.stderr);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (!caseA.stdout.includes(QUEUED_MARKER)) {
	console.error(`FAIL case A (queued): stdout missing "${QUEUED_MARKER}"`);
	console.error("stdout:", caseA.stdout);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (caseA.stdout.includes(NOT_QUEUED_MARKER)) {
	console.error(`FAIL case A (queued): stdout leaked "${NOT_QUEUED_MARKER}"`);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

// Case B — rejected: gh merge prints the GraphQL "clean status" message
// (matches reality — exit code is 0 for that response in our observations,
// the rejection is signalled only by autoMergeRequest staying null) and
// `gh pr view` reports null. Wrapper prints the NOT QUEUED message + the
// manual command, exits 0.
const stubRejectedPath = buildStub({
	dir: join(tmp, "rejected"),
	mergeStdout: "",
	mergeStderr: "GraphQL: Pull request Pull request is in clean status (enablePullRequestAutoMerge)",
	mergeCode: 0,
	viewJson: '{"autoMergeRequest":null}',
});

const caseB = await runWrapper(stubRejectedPath);
if (caseB.code !== 0) {
	console.error(`FAIL case B (rejected): exit ${caseB.code} (expected 0)`);
	console.error("stdout:", caseB.stdout);
	console.error("stderr:", caseB.stderr);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (!caseB.stdout.includes(NOT_QUEUED_MARKER)) {
	console.error(`FAIL case B (rejected): stdout missing "${NOT_QUEUED_MARKER}"`);
	console.error("stdout:", caseB.stdout);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (!caseB.stdout.includes("gh pr merge --squash --delete-branch 12345")) {
	console.error("FAIL case B (rejected): stdout missing the manual fallback command for PR 12345");
	console.error("stdout:", caseB.stdout);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}
if (caseB.stdout.includes(QUEUED_MARKER)) {
	console.error(`FAIL case B (rejected): stdout leaked "${QUEUED_MARKER}"`);
	rmSync(tmp, { recursive: true, force: true });
	process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });
console.log("smoke-032: PASS");
