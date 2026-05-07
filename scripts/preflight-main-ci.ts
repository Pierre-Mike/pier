#!/usr/bin/env bun

/**
 * Preflight check: abort if main CI is red.
 *
 * Usage: bun scripts/preflight-main-ci.ts [--force]
 *
 * Env:
 *   PIER_PREFLIGHT_GH_BIN  — path to gh binary (default: "gh")
 *
 * Exit codes:
 *   0 — CI is green (or no runs yet, or --force)
 *   1 — CI is RED, or gh not found
 */

const force = process.argv.includes("--force");

if (force) {
	console.error("[preflight] forced — skipping CI check");
	process.exit(0);
}

const ghBin = process.env.PIER_PREFLIGHT_GH_BIN ?? "gh";

interface RunEntry {
	readonly conclusion: string;
	readonly status: string;
	readonly databaseId: number;
	readonly url: string;
}

async function spawnGh(): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(
		[
			ghBin,
			"run",
			"list",
			"--branch",
			"main",
			"--workflow",
			"CI",
			"--limit",
			"1",
			"--json",
			"conclusion,status,databaseId,url",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { code, stdout, stderr };
}

let result: { code: number; stdout: string; stderr: string };
try {
	result = await spawnGh();
} catch {
	console.error("[preflight] gh CLI not found — install gh or set PIER_PREFLIGHT_GH_BIN");
	process.exit(1);
}

if (result.code !== 0) {
	// gh itself failed — could be auth, missing binary via PATH, etc.
	const msg = result.stderr.trim();
	if (msg.includes("executable file not found") || msg.includes("No such file")) {
		console.error("[preflight] gh CLI not found — install gh or set PIER_PREFLIGHT_GH_BIN");
	} else {
		console.error(`[preflight] gh exited ${result.code}: ${msg}`);
	}
	process.exit(1);
}

let runs: RunEntry[];
try {
	runs = JSON.parse(result.stdout) as RunEntry[];
} catch {
	console.error("[preflight] failed to parse gh output:", result.stdout);
	process.exit(1);
}

if (runs.length === 0) {
	// No runs yet — treat as green
	process.exit(0);
}

const latest = runs[0];

if (latest.conclusion === "FAILURE") {
	console.error(
		`[preflight] main CI is RED — fix that before starting a new spec, or pass --force\n  run: ${latest.url}`,
	);
	process.exit(1);
}

// SUCCESS, IN_PROGRESS, CANCELLED, SKIPPED, etc. — allow
process.exit(0);
