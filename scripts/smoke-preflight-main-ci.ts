#!/usr/bin/env bun

// smoke-preflight-main-ci.ts
// spec 025 workflow gate: verify preflight-main-ci.ts exits correctly for
// green / red / red-with-force cases using a hermetic stub gh binary.
// RED: exits 1 until scripts/preflight-main-ci.ts is implemented.

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = import.meta.dir.replace(/\/scripts$/, "");
const PREFLIGHT = join(REPO_ROOT, "scripts", "preflight-main-ci.ts");

const tmp = mkdtempSync(join(tmpdir(), "smoke-025-"));

interface StubOpts {
	readonly dir: string;
	readonly name: string;
	readonly json: string;
}

function makeStub({ dir, name, json }: StubOpts): string {
	const path = join(dir, name);
	writeFileSync(path, `#!/usr/bin/env bash\necho '${json}'\n`);
	chmodSync(path, 0o755);
	return path;
}

async function run(
	ghBin: string,
	extraArgs: string[] = [],
): Promise<{ code: number; stderr: string; stdout: string }> {
	const proc = Bun.spawn(["bun", PREFLIGHT, ...extraArgs], {
		env: { ...process.env, PIER_PREFLIGHT_GH_BIN: ghBin },
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

// Case A — green: stub returns SUCCESS conclusion → expect exit 0
const stubGreen = makeStub({
	dir: tmp,
	name: "gh-green",
	json: '[{"conclusion":"SUCCESS","status":"completed","databaseId":1,"htmlUrl":"https://github.com/example/actions/runs/1"}]',
});

const caseA = await run(stubGreen);
if (caseA.code !== 0) {
	console.error(`FAIL case A (green): expected exit 0, got ${caseA.code}`);
	console.error("stderr:", caseA.stderr);
	process.exit(1);
}

// Case B — red: stub returns FAILURE conclusion → expect exit 1 + "main CI is RED" in stderr
const stubRed = makeStub({
	dir: tmp,
	name: "gh-red",
	json: '[{"conclusion":"FAILURE","status":"completed","databaseId":2,"htmlUrl":"https://github.com/example/actions/runs/2"}]',
});

const caseB = await run(stubRed);
if (caseB.code !== 1) {
	console.error(`FAIL case B (red): expected exit 1, got ${caseB.code}`);
	console.error("stderr:", caseB.stderr);
	process.exit(1);
}
if (!caseB.stderr.includes("main CI is RED")) {
	console.error(`FAIL case B (red): stderr missing "main CI is RED"`);
	console.error("stderr:", caseB.stderr);
	process.exit(1);
}

// Case C — red + force: same red stub, pass --force → expect exit 0 + forced/skipping in stderr
const caseC = await run(stubRed, ["--force"]);
if (caseC.code !== 0) {
	console.error(`FAIL case C (red+force): expected exit 0, got ${caseC.code}`);
	console.error("stderr:", caseC.stderr);
	process.exit(1);
}
const forcedMsg = caseC.stderr.toLowerCase();
if (!forcedMsg.includes("forced") && !forcedMsg.includes("skipping")) {
	console.error(`FAIL case C (red+force): stderr missing "forced" or "skipping"`);
	console.error("stderr:", caseC.stderr);
	process.exit(1);
}

console.log("smoke-025: PASS");
