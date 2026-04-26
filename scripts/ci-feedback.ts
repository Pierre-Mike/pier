/**
 * CI failure feedback loop — fetch failing CI logs for a PR, write a brief.
 *
 * Invoked by `/do` Step 9 when CI goes red: shells out to `gh pr checks`, finds
 * every non-success row, pulls `--log-failed` for each run, and writes
 * `ci-failure.md` into the spec's active directory inside the worktree. A
 * follow-up session (human or future autonomous fix subagent) reads the brief
 * and drives the fix. No LLM call happens here — deterministic data flow only.
 *
 * Unit tests for pure fns (parseFailingChecks, extractRunId, formatFailureBrief)
 * live in scripts/ci-feedback.test.ts. IO (fetchPrChecks, fetchFailingLogs,
 * writeBrief, resolveActiveSpecDir, run) is covered by scripts/smoke-ci-feedback.ts.
 */

import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FailingCheck {
	name: string;
	conclusion: string;
	detailsUrl: string;
	runId: string | null;
}

export interface PrInfo {
	url: string;
	headBranch: string;
}

const RUN_ID_RE = /\/actions\/runs\/(\d+)(?:\/|$)/;
const SUCCESS_STATES = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const LOG_TRUNCATE_LINES = 200;

export function extractRunId({ detailsUrl }: { detailsUrl: string }): string | null {
	if (detailsUrl.length === 0) return null;
	const m = detailsUrl.match(RUN_ID_RE);
	if (m === null) return null;
	return m[1] ?? null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function parseFailingChecks({ checksJson }: { checksJson: unknown }): FailingCheck[] {
	if (!Array.isArray(checksJson)) {
		throw new Error("parseFailingChecks: expected an array");
	}
	const out: FailingCheck[] = [];
	for (const row of checksJson) {
		if (!isRecord(row)) {
			throw new Error("parseFailingChecks: expected each row to be an object");
		}
		const { name, state, link } = row;
		if (typeof name !== "string" || typeof state !== "string" || typeof link !== "string") {
			throw new Error("parseFailingChecks: row missing name/state/link string field");
		}
		if (SUCCESS_STATES.has(state)) continue;
		out.push({
			name,
			conclusion: state,
			detailsUrl: link,
			runId: extractRunId({ detailsUrl: link }),
		});
	}
	return out;
}

function truncateLog(raw: string, maxLines: number): string {
	const lines = raw.split("\n");
	if (lines.length <= maxLines) return raw;
	const kept = lines.slice(lines.length - maxLines);
	return `[… ${lines.length - maxLines} earlier line(s) omitted]\n${kept.join("\n")}`;
}

export function formatFailureBrief({
	pr,
	failingChecks,
	logs,
}: {
	pr: PrInfo;
	failingChecks: FailingCheck[];
	logs: Record<string, string>;
}): string {
	const parts: string[] = [];
	parts.push("# CI failure brief");
	parts.push("");
	parts.push(`- PR: ${pr.url}`);
	parts.push(`- branch: ${pr.headBranch}`);
	parts.push(`- failing checks: ${failingChecks.length}`);
	parts.push("");

	if (failingChecks.length === 0) {
		parts.push("No failing checks found. (This brief was generated anyway; rerun `gh pr checks`.)");
		return `${parts.join("\n")}\n`;
	}

	parts.push("## Failing checks");
	parts.push("");
	parts.push("| name | state | run id | url |");
	parts.push("| --- | --- | --- | --- |");
	for (const c of failingChecks) {
		parts.push(`| ${c.name} | ${c.conclusion} | ${c.runId ?? "—"} | ${c.detailsUrl} |`);
	}
	parts.push("");

	parts.push("## Logs");
	parts.push("");
	for (const c of failingChecks) {
		parts.push(`### ${c.name} (run ${c.runId ?? "unknown"})`);
		parts.push("");
		const log = c.runId !== null ? logs[c.runId] : undefined;
		if (log === undefined || log.length === 0) {
			parts.push("_no log available_");
		} else {
			parts.push("```");
			parts.push(truncateLog(log, LOG_TRUNCATE_LINES));
			parts.push("```");
		}
		parts.push("");
	}

	parts.push("## Next steps");
	parts.push("");
	parts.push("1. Read the logs above; identify root cause(s).");
	parts.push("2. Edit the spec's file_targets to fix.");
	parts.push("3. `bun run check` then `bun run tasks:verify`.");
	parts.push("4. `git push` — CI reruns automatically on the open PR.");

	return `${parts.join("\n")}\n`;
}

// ---------- IO helpers (covered by smoke) ----------

async function runGh(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	return { code, stdout, stderr };
}

export async function fetchPrChecks({ prUrl }: { prUrl: string }): Promise<unknown> {
	const res = await runGh(["pr", "checks", prUrl, "--json", "name,state,link"]);
	if (res.code !== 0) {
		throw new Error(`gh pr checks failed (exit ${res.code}): ${res.stderr.trim()}`);
	}
	return JSON.parse(res.stdout) as unknown;
}

export async function fetchPrInfo({ prUrl }: { prUrl: string }): Promise<PrInfo> {
	const res = await runGh(["pr", "view", prUrl, "--json", "url,headRefName"]);
	if (res.code !== 0) {
		throw new Error(`gh pr view failed (exit ${res.code}): ${res.stderr.trim()}`);
	}
	const parsed: unknown = JSON.parse(res.stdout);
	if (!isRecord(parsed)) throw new Error("gh pr view: expected object");
	const { url, headRefName } = parsed;
	if (typeof url !== "string" || typeof headRefName !== "string") {
		throw new Error("gh pr view: expected string url + headRefName");
	}
	return { url, headBranch: headRefName };
}

export async function fetchFailingLogs({ runId }: { runId: string }): Promise<string> {
	const res = await runGh(["run", "view", runId, "--log-failed"]);
	// `gh run view --log-failed` exits non-zero when the run had no failed jobs
	// (e.g. still pending). Treat as empty log rather than an error.
	if (res.code !== 0) return "";
	return res.stdout;
}

export function writeBrief({ specDir, content }: { specDir: string; content: string }): string {
	const path = join(specDir, "ci-failure.md");
	writeFileSync(path, content);
	return path;
}

export function resolveActiveSpecDir({ worktreePath }: { worktreePath: string }): string {
	const activeDir = join(worktreePath, "specs", "active");
	if (!existsSync(activeDir)) {
		throw new Error(`resolveActiveSpecDir: ${activeDir} does not exist`);
	}
	const children = readdirSync(activeDir).filter((name) => {
		if (name.startsWith("_") || name.startsWith(".")) return false;
		return statSync(join(activeDir, name)).isDirectory();
	});
	if (children.length === 0) {
		throw new Error(`resolveActiveSpecDir: no active spec in ${activeDir}`);
	}
	if (children.length > 1) {
		throw new Error(
			`resolveActiveSpecDir: expected exactly 1 active spec in ${activeDir}, found ${children.length}: ${children.join(", ")}`,
		);
	}
	const first = children[0];
	if (first === undefined) {
		throw new Error(`resolveActiveSpecDir: no active spec in ${activeDir}`);
	}
	return join(activeDir, first);
}

interface ParsedArgs {
	prUrl: string | null;
	worktree: string;
	dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = {
		prUrl: null,
		worktree: process.cwd(),
		dryRun: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--worktree") {
			const v = argv[++i];
			if (v !== undefined) out.worktree = v;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a !== undefined && !a.startsWith("--") && out.prUrl === null) {
			out.prUrl = a;
		}
	}
	return out;
}

export async function run(argv: string[]): Promise<number> {
	const args = parseArgs(argv.slice(2));
	if (args.prUrl === null) {
		process.stderr.write(
			"usage: bun scripts/ci-feedback.ts <pr-url> [--worktree <path>] [--dry-run]\n",
		);
		return 1;
	}

	let pr: PrInfo;
	let checksRaw: unknown;
	try {
		pr = await fetchPrInfo({ prUrl: args.prUrl });
		checksRaw = await fetchPrChecks({ prUrl: args.prUrl });
	} catch (e) {
		process.stderr.write(`✖ ${e instanceof Error ? e.message : String(e)}\n`);
		return 1;
	}

	const failing = parseFailingChecks({ checksJson: checksRaw });
	if (failing.length === 0) {
		process.stderr.write("✖ no failing checks found for this PR\n");
		return 1;
	}

	const logs: Record<string, string> = {};
	for (const c of failing) {
		if (c.runId === null) continue;
		if (logs[c.runId] !== undefined) continue;
		logs[c.runId] = await fetchFailingLogs({ runId: c.runId });
	}

	const content = formatFailureBrief({ pr, failingChecks: failing, logs });

	if (args.dryRun) {
		process.stdout.write(content);
		return 0;
	}

	const specDir = resolveActiveSpecDir({ worktreePath: args.worktree });
	const path = writeBrief({ specDir, content });
	process.stdout.write(`✓ wrote ${path}\n`);
	return 0;
}

if (import.meta.main) {
	const code = await run(process.argv);
	process.exit(code);
}
