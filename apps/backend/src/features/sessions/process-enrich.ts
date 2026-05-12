/**
 * spec 055 — pane-level enrichment via live process inspection.
 *
 * Per-cwd transcript enrichment can only assign ONE resume-id per session;
 * a session with multiple Claude panes (the orchestrator's use case) winds
 * up with the same resume on every pane after restore.
 *
 * Fix: enumerate live Claude processes, then for each process pull its
 * env (ZELLIJ_SESSION_NAME, ZELLIJ_PANE_ID) and cmdline. The env vars give
 * the exact (session, pane) tuple that proc belongs to. The cmdline carries
 * the explicit `--resume <uuid>` flag when claude was started that way;
 * otherwise the caller falls back to "newest transcript in cwd, excluding
 * UUIDs already pinned to other panes."
 *
 * macOS toolchain:
 *   pgrep -lf claude            → "<pid> <cmdline>" per match
 *   ps -p <pid> -E              → cmdline followed by env=value pairs
 *   lsof -a -p <pid> -d cwd -Fn → "n<cwd>" on its own line
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { normalizeZellijPaneId, type SnapshotEntry } from "./snapshot.ts";
import { encodeClaudeProjectName, findRecentTranscript } from "./transcript-enrich.ts";

// ---------------------------------------------------------------------------
// Types & seams
// ---------------------------------------------------------------------------

export type SpawnExitWithOut = (cmd: readonly string[]) => Promise<{
	exitCode: number;
	stdout: string;
}>;

export type ClaudeProc = {
	readonly pid: number;
	readonly cwd: string | null;
	readonly cmdline: string;
	readonly cmdlineResumeId: string | null;
	readonly zellijSessionName: string | null;
	readonly zellijPaneId: string | null;
};

// ---------------------------------------------------------------------------
// Pure parsers
// ---------------------------------------------------------------------------

/**
 * Extracts the resume-id from a Claude command line. Returns null if no
 * `--resume <uuid>` flag is present. Tolerates `--resume=<uuid>` and
 * `--resume <uuid>` forms.
 */
export function extractResumeIdFromCmdline(cmdline: string): string | null {
	const m = cmdline.match(/--resume[=\s]+([0-9a-f-]{36})/i);
	if (!m?.[1]) return null;
	return m[1].toLowerCase();
}

/**
 * Parses one line of `pgrep -lf` output into pid + cmdline. Returns null
 * when the line doesn't start with a pid.
 */
export function parsePgrepLine(line: string): { pid: number; cmdline: string } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	const m = trimmed.match(/^(\d+)\s+(.+)$/);
	if (!m?.[1] || !m[2]) return null;
	return { pid: Number(m[1]), cmdline: m[2] };
}

/**
 * Heuristic: is this cmdline an actual `claude` process worth tracking?
 * Filters out statusline shells (`/bin/bash .../statusline.sh`), grep
 * processes, and anything whose argv0 isn't `claude` or a path ending
 * in `/claude`.
 */
export function looksLikeClaudeProcess(cmdline: string): boolean {
	if (cmdline.includes("statusline.sh")) return false;
	if (cmdline.startsWith("grep ") || cmdline.includes(" grep ")) return false;
	// argv0 is everything up to the first space.
	const argv0 = cmdline.split(/\s+/, 1)[0] ?? "";
	if (argv0 === "claude") return true;
	if (argv0.endsWith("/claude")) return true;
	return false;
}

/**
 * Parses `ps -p <pid> -E` output. The first whitespace-delimited tokens
 * are the cmdline; environment variables appear as KEY=VALUE entries
 * after the cmdline. We extract ZELLIJ_SESSION_NAME and ZELLIJ_PANE_ID.
 *
 * Format on macOS:
 *   <pid> ttys000 TIME claude --arg val ENV1=val ENV2=val ...
 */
export function parsePsEEnvVars(output: string): {
	ZELLIJ_SESSION_NAME?: string;
	ZELLIJ_PANE_ID?: string;
} {
	const out: { ZELLIJ_SESSION_NAME?: string; ZELLIJ_PANE_ID?: string } = {};
	for (const tok of output.split(/\s+/)) {
		const eq = tok.indexOf("=");
		if (eq <= 0) continue;
		const key = tok.slice(0, eq);
		const value = tok.slice(eq + 1);
		if (key === "ZELLIJ_SESSION_NAME") out.ZELLIJ_SESSION_NAME = value;
		else if (key === "ZELLIJ_PANE_ID") out.ZELLIJ_PANE_ID = value;
	}
	return out;
}

/**
 * Parses `lsof -a -p <pid> -d cwd -Fn` output. Returns the cwd or null.
 * lsof's `-F` mode emits records like:
 *   p<pid>
 *   fcwd
 *   n<absolute-path>
 */
export function parseLsofCwd(output: string): string | null {
	for (const line of output.split("\n")) {
		if (line.startsWith("n") && line.length > 1) return line.slice(1).trim();
	}
	return null;
}

// ---------------------------------------------------------------------------
// Imperative shell
// ---------------------------------------------------------------------------

export type DefaultSpawnerOptions = { timeoutMs?: number };

export const makeDefaultSpawner = (opts: DefaultSpawnerOptions = {}): SpawnExitWithOut => {
	const timeoutMs = opts.timeoutMs ?? 3000;
	return async (cmd) => {
		const proc = Bun.spawn([...cmd], { stdout: "pipe", stderr: "pipe" });
		const winner = await Promise.race([
			proc.exited,
			new Promise<number>((resolve) => setTimeout(() => resolve(-1), timeoutMs)),
		]);
		if (winner === -1) {
			proc.kill();
			return { exitCode: -1, stdout: "" };
		}
		const stdout = await new Response(proc.stdout).text().catch(() => "");
		return { exitCode: winner, stdout };
	};
};

/**
 * Enumerates every live Claude process by pgrep-ing for the binary,
 * filtering out false positives (statusline shells, grep), then
 * resolving each PID's cwd + env via lsof and ps.
 */
export async function listClaudeProcesses(
	opts: { spawn?: SpawnExitWithOut } = {},
): Promise<readonly ClaudeProc[]> {
	const spawn = opts.spawn ?? makeDefaultSpawner();

	// `ps -A` is more reliable than `pgrep -f claude` on macOS — dogfood
	// showed pgrep silently dropping a live PID when two claude processes
	// shared a session/cwd. `ps -A` lists every visible process, then we
	// filter by cmdline.
	const psList = await spawn(["ps", "-Ao", "pid=,command="]);
	if (psList.exitCode !== 0) return [];

	const procs: ClaudeProc[] = [];
	for (const line of psList.stdout.split("\n")) {
		const parsed = parsePgrepLine(line);
		if (!parsed) continue;
		if (!looksLikeClaudeProcess(parsed.cmdline)) continue;
		const { pid, cmdline } = parsed;

		// `-o command=` is required on macOS — the default columnar format
		// truncates env strings around 80 chars, hiding ZELLIJ_PANE_ID etc.
		const [psE, lsof] = await Promise.all([
			spawn(["ps", "-E", "-p", String(pid), "-o", "command="]),
			spawn(["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"]),
		]);

		const env = psE.exitCode === 0 ? parsePsEEnvVars(psE.stdout) : {};
		const cwd = lsof.exitCode === 0 ? parseLsofCwd(lsof.stdout) : null;

		procs.push({
			pid,
			cwd,
			cmdline,
			cmdlineResumeId: extractResumeIdFromCmdline(cmdline),
			zellijSessionName: env.ZELLIJ_SESSION_NAME ?? null,
			zellijPaneId: normalizeZellijPaneId(env.ZELLIJ_PANE_ID),
		});
	}
	return procs;
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

export type ProcessEnrichOptions = {
	readonly procs?: readonly ClaudeProc[];
	readonly spawn?: SpawnExitWithOut;
	readonly projectsRoot?: string;
	readonly home?: string;
	readonly recencyMs?: number;
	readonly now?: () => number;
};

/**
 * Enriches a list of discovery entries with claudeResumeId / cwd /
 * transcriptPath using live Claude processes as the primary source and
 * `~/.claude/projects/` transcripts as the fallback.
 *
 * Matching rule (per entry):
 *   1. If the entry already has a non-null claudeResumeId → leave it.
 *   2. Find a Claude proc whose (zellijSessionName, zellijPaneId)
 *      matches the entry. If proc.cmdlineResumeId is set, use it.
 *      Otherwise, find the newest transcript in proc.cwd whose UUID
 *      isn't already assigned to another entry in this session
 *      (multi-pane same-cwd disambiguation).
 *   3. Always set entry.cwd from proc.cwd (more authoritative than any
 *      session-name heuristic).
 */
export async function enrichEntriesWithProcesses(
	entries: readonly SnapshotEntry[],
	opts: ProcessEnrichOptions = {},
): Promise<readonly SnapshotEntry[]> {
	const listOpts: { spawn?: SpawnExitWithOut } = {};
	if (opts.spawn !== undefined) listOpts.spawn = opts.spawn;
	const procs = opts.procs ?? (await listClaudeProcesses(listOpts));
	const home = opts.home ?? homedir();
	const projectsRoot = opts.projectsRoot ?? join(home, ".claude", "projects");
	const recencyMs = opts.recencyMs ?? 24 * 60 * 60 * 1000;
	const now = (opts.now ?? (() => Date.now()))();

	const findProcForEntry = (entry: SnapshotEntry): ClaudeProc | undefined =>
		procs.find((p) => p.zellijSessionName === entry.name && p.zellijPaneId === entry.paneId);

	const assigned: SnapshotEntry[] = [...entries];
	const usedResumeIds = new Set<string>();

	// PASS 1 — pin by exact (session, paneId) match against claude proc env.
	for (let i = 0; i < assigned.length; i++) {
		assigned[i] = pinFromCmdline({
			entry: assigned[i],
			findProc: findProcForEntry,
			usedResumeIds,
		});
	}

	// PASS 2 — fall back to "newest transcript in proc.cwd not yet pinned"
	// for entries whose proc had no `--resume` flag on the cmdline.
	for (let i = 0; i < assigned.length; i++) {
		assigned[i] = await pinFromTranscript(assigned[i], {
			findProcForEntry,
			usedResumeIds,
			projectsRoot,
			recencyMs,
			now,
		});
	}

	return assigned;
}

function pinFromCmdline(args: {
	entry: SnapshotEntry | undefined;
	findProc: (e: SnapshotEntry) => ClaudeProc | undefined;
	usedResumeIds: Set<string>;
}): SnapshotEntry {
	const { entry, findProc, usedResumeIds } = args;
	if (!entry) return entry as never;
	if (entry.claudeResumeId || !entry.paneId) return entry;
	const proc = findProc(entry);
	if (!proc) return entry;
	const cwd = proc.cwd ?? entry.cwd;
	if (!proc.cmdlineResumeId) return { ...entry, cwd: cwd || entry.cwd };
	usedResumeIds.add(proc.cmdlineResumeId);
	return { ...entry, cwd: cwd || entry.cwd, claudeResumeId: proc.cmdlineResumeId };
}

async function pinFromTranscript(
	entry: SnapshotEntry | undefined,
	args: {
		findProcForEntry: (e: SnapshotEntry) => ClaudeProc | undefined;
		usedResumeIds: Set<string>;
		projectsRoot: string;
		recencyMs: number;
		now: number;
	},
): Promise<SnapshotEntry> {
	if (!entry) return entry as never;
	if (entry.claudeResumeId || !entry.paneId) return entry;
	const proc = args.findProcForEntry(entry);
	if (!proc?.cwd) return entry;
	const hit = await findRecentTranscript({
		projectsRoot: args.projectsRoot,
		encodedCwd: encodeClaudeProjectName(proc.cwd),
		recencyMs: args.recencyMs,
		now: args.now,
	});
	if (!hit || args.usedResumeIds.has(hit.sessionId)) return entry;
	args.usedResumeIds.add(hit.sessionId);
	return {
		...entry,
		cwd: proc.cwd,
		claudeResumeId: hit.sessionId,
		transcriptPath: entry.transcriptPath ?? hit.transcriptPath,
	};
}
