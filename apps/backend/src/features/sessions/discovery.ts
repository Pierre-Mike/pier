/**
 * spec 048 — zellij session discovery
 *
 * Enumerates live zellij sessions and their tabs / panes / running commands by
 * (a) listing socket files under `<ZELLIJ_SOCKET_DIR>/contract_version_1/` and
 * (b) shelling `zellij --session <name> action list-tabs|list-panes|list-clients`.
 *
 * We do NOT call `zellij list-sessions` from Bun.spawn — it hangs ~25s without a
 * TTY (see comment in sessions.repo.ts). Sockets-on-disk are the truth source.
 *
 * Output shape is the SnapshotEntry array — caller can hand the entries to
 * snapshotSession() to persist.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotEntry } from "./snapshot.ts";

// ---------------------------------------------------------------------------
// Pure parsers — tested directly against fixture strings
// ---------------------------------------------------------------------------

export type ZellijTab = { readonly id: string; readonly position: number; readonly name: string };
export type ZellijPane = { readonly id: string; readonly type: string; readonly title: string };
export type ZellijClient = {
	readonly clientId: string;
	readonly paneId: string;
	readonly runningCommand: string;
};

/**
 * Parses output of `zellij action list-tabs`. Format (whitespace-separated):
 *   TAB_ID  POSITION  NAME
 *   0       0         my-tab name with spaces
 */
export function parseListTabs(out: string): readonly ZellijTab[] {
	const result: ZellijTab[] = [];
	for (const raw of out.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("TAB_ID")) continue;
		const m = line.match(/^(\S+)\s+(\d+)\s+(.+)$/);
		if (!m?.[1] || !m[2] || !m[3]) continue;
		result.push({ id: m[1], position: Number(m[2]), name: m[3].trim() });
	}
	return result;
}

/**
 * Parses output of `zellij action list-panes`. Format:
 *   PANE_ID     TYPE      TITLE
 *   terminal_0  terminal  pierre-mikel@LOGIC-1335
 */
export function parseListPanes(out: string): readonly ZellijPane[] {
	const result: ZellijPane[] = [];
	for (const raw of out.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("PANE_ID")) continue;
		const m = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
		if (!m?.[1] || !m[2] || !m[3]) continue;
		result.push({ id: m[1], type: m[2], title: m[3].trim() });
	}
	return result;
}

/**
 * Parses output of `zellij action list-clients`. Format:
 *   CLIENT_ID  ZELLIJ_PANE_ID  RUNNING_COMMAND
 *   3          terminal_0      claude --resume sess_abc
 * RUNNING_COMMAND may contain spaces — captured to end of line.
 */
export function parseListClients(out: string): readonly ZellijClient[] {
	const result: ZellijClient[] = [];
	for (const raw of out.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("CLIENT_ID")) continue;
		const m = line.match(/^(\S+)\s+(\S+)\s+(.+)$/);
		if (!m?.[1] || !m[2] || !m[3]) continue;
		result.push({ clientId: m[1], paneId: m[2], runningCommand: m[3].trim() });
	}
	return result;
}

// ---------------------------------------------------------------------------
// Imperative shell — socket enumeration + zellij spawns
// ---------------------------------------------------------------------------

export type SpawnResult = {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
};
export type Spawner = (cmd: readonly string[], socketDir: string) => Promise<SpawnResult>;

/**
 * Default spawner. 3 s timeout — `zellij action ...` returns in ~20 ms in
 * practice. On timeout, kills the process and returns exitCode -1.
 * Captures stderr because zellij writes "Session not found" to stderr
 * while still printing the active-session list to stdout — without stderr
 * we'd mis-parse the stdout fallback as real list-tabs output.
 */
export const defaultSpawner: Spawner = async (cmd, socketDir) => {
	const proc = Bun.spawn([...cmd], {
		env: { ...process.env, ZELLIJ_SOCKET_DIR: socketDir },
		stdout: "pipe",
		stderr: "pipe",
	});
	const TIMEOUT_MS = 3000;
	const exitCode = await Promise.race([
		proc.exited,
		new Promise<number>((resolve) => setTimeout(() => resolve(-1), TIMEOUT_MS)),
	]);
	if (exitCode === -1) {
		proc.kill();
		return { stdout: "", stderr: "", exitCode: -1 };
	}
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text().catch(() => ""),
		new Response(proc.stderr).text().catch(() => ""),
	]);
	return { stdout, stderr, exitCode };
};

/**
 * Returns the list of session names found as socket files under
 * `<zellijRoot>/contract_version_1/`. Returns `[]` if the dir is missing.
 */
export async function enumerateZellijSessions(zellijRoot: string): Promise<readonly string[]> {
	const socketDir = join(zellijRoot, "contract_version_1");
	try {
		const entries = await readdir(socketDir);
		// Skip dotfiles — zellij never writes them as socket names.
		return entries.filter((e) => !e.startsWith("."));
	} catch {
		return [];
	}
}

/**
 * Detects zellij's "Session 'X' not found" error message. Zellij returns
 * exit code 0 even on this failure, so the only signal is the stdout prefix.
 */
export function isOrphanedSessionOutput(stdout: string): boolean {
	return /^Session '[^']*' not found\./m.test(stdout);
}

/**
 * Convenience: tabs + panes + clients for one session, best-effort. The
 * `orphaned` flag is true when zellij reports the session as not found
 * (socket on disk but no live server bound to it — the recovery target).
 * Any other failure yields empty arrays.
 */
export async function inspectSession(
	session: string,
	opts: { zellijRoot: string; spawner?: Spawner },
): Promise<{
	tabs: readonly ZellijTab[];
	panes: readonly ZellijPane[];
	clients: readonly ZellijClient[];
	orphaned: boolean;
}> {
	const spawner = opts.spawner ?? defaultSpawner;
	const sock = opts.zellijRoot;
	const [tabsRes, panesRes, clientsRes] = await Promise.all([
		spawner(["zellij", "--session", session, "action", "list-tabs"], sock),
		spawner(["zellij", "--session", session, "action", "list-panes"], sock),
		spawner(["zellij", "--session", session, "action", "list-clients"], sock),
	]);
	// Orphan only when EVERY sub-call agrees — running three actions in
	// parallel against a live socket can transiently return the marker from
	// one call while the others succeed. ALL-agree avoids false positives
	// that would replace pier:terminal_<n> entries with a session-summary
	// `pier` (crashed) row and lose pane data.
	const matches = (r: { stdout: string; stderr: string }): boolean =>
		isOrphanedSessionOutput(r.stderr) || isOrphanedSessionOutput(r.stdout);
	const orphaned = matches(tabsRes) && matches(panesRes) && matches(clientsRes);
	if (orphaned) {
		return { tabs: [], panes: [], clients: [], orphaned: true };
	}
	return {
		tabs: tabsRes.exitCode === 0 ? parseListTabs(tabsRes.stdout) : [],
		panes: panesRes.exitCode === 0 ? parseListPanes(panesRes.stdout) : [],
		clients: clientsRes.exitCode === 0 ? parseListClients(clientsRes.stdout) : [],
		orphaned: false,
	};
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

export type DiscoveryOptions = {
	readonly zellijRoot?: string;
	readonly spawner?: Spawner;
	readonly now?: () => Date;
};

/**
 * Discovers every live zellij session and produces one `SnapshotEntry` per
 * session, populated with the data zellij CLI exposes:
 *
 *   - name          — session name (socket filename)
 *   - tabTitle      — first tab's name, if any
 *   - lastPrompt    — running command of the focused pane (best-effort)
 *   - status        — "active" for every session with a live socket
 *
 * Fields that zellij cannot supply (cwd, transcriptPath, claudeResumeId) are
 * left empty / null. A later enrichment pass can fill them by parsing
 * `~/.claude/projects/<encoded-cwd>/` or by joining against pier's own
 * sessions.jsonl registry.
 */
export async function discoverSnapshotEntries(
	opts: DiscoveryOptions = {},
): Promise<readonly SnapshotEntry[]> {
	const zellijRoot = opts.zellijRoot ?? "/var/z";
	const spawner = opts.spawner ?? defaultSpawner;
	const now = (opts.now ?? (() => new Date()))();
	const sessions = await enumerateZellijSessions(zellijRoot);
	const entries: SnapshotEntry[] = [];
	for (const name of sessions) {
		const inspected = await inspectSession(name, { zellijRoot, spawner });
		entries.push(...buildSessionEntries({ name, ...inspected, now }));
	}
	return entries;
}

type SessionEntryArgs = {
	name: string;
	tabs: readonly ZellijTab[];
	panes: readonly ZellijPane[];
	clients: readonly ZellijClient[];
	orphaned: boolean;
	now: Date;
};

function buildSessionEntries(args: SessionEntryArgs): SnapshotEntry[] {
	const tabTitle = args.tabs[0]?.name ?? null;
	const cmd = args.clients[0]?.runningCommand;
	const lastPrompt = cmd && cmd !== "N/A" ? cmd : null;
	const status: SnapshotEntry["status"] = args.orphaned ? "crashed" : "active";

	const summary = (override: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
		name: args.name,
		paneId: null,
		tabTitle,
		cwd: "",
		transcriptPath: null,
		claudeResumeId: null,
		lastPrompt,
		status,
		updatedAt: args.now,
		...override,
	});

	if (args.orphaned) return [summary()];

	// One entry per *terminal* pane. Plugin panes (tab-bar, status-bar)
	// never host a Claude process and are filtered out. Sessions with no
	// terminal panes fall back to a single session-summary entry.
	const terminalPanes = args.panes.filter((p) => p.type === "terminal");
	if (terminalPanes.length === 0) return [summary()];

	return terminalPanes.map((pane) =>
		summary({
			paneId: pane.id,
			// Only the focused client's running command is known; tag the
			// matched pane so the registry has at least one breadcrumb.
			lastPrompt: args.clients[0]?.paneId === pane.id ? lastPrompt : null,
		}),
	);
}
