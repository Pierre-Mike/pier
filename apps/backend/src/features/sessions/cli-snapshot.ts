/**
 * spec 050 — CLI / orchestrator entry point for snapshot + restore.
 *
 * Pure logic lives here so it can be unit-tested without spawning zellij or
 * touching the filesystem. The thin `scripts/pier-snapshot.ts` wrapper parses
 * argv and calls these functions with injectable I/O seams.
 */

import { join } from "node:path";
import { writeToPane } from "../zellij/write-to-pane.ts";
import { defaultSpawner, discoverSnapshotEntries, type Spawner } from "./discovery.ts";
import { enrichEntriesWithProcesses, type ProcessEnrichOptions } from "./process-enrich.ts";
import { entryKey, listResumable, type SnapshotEntry, snapshotSession } from "./snapshot.ts";
import { type EnrichOptions, enrichEntries } from "./transcript-enrich.ts";

// ---------------------------------------------------------------------------
// Types & seams
// ---------------------------------------------------------------------------

export type SpawnOnly = (cmd: readonly string[]) => Promise<{ exitCode: number }>;

export type SnapshotNowDeps = {
	readonly dataDir: string;
	readonly zellijRoot?: string;
	readonly spawner?: Spawner;
	readonly persist?: typeof snapshotSession;
	readonly now?: () => Date;
	// Transcript-enrich options. `enrich: false` disables the post-discovery
	// backfill from ~/.claude/projects/ entirely (useful for tests that don't
	// want the helper poking at the real home dir).
	readonly enrich?: false | EnrichOptions;
	// Process-enrich options. `processEnrich: false` disables the pgrep/lsof
	// pass entirely. Same shape as ProcessEnrichOptions otherwise.
	readonly processEnrich?: false | ProcessEnrichOptions;
};

export type RestoreDeps = {
	readonly dataDir: string;
	readonly sessionName: string;
	readonly spawn: SpawnOnly;
	readonly zellijRoot?: string;
	readonly onWarn?: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// snapshot now
// ---------------------------------------------------------------------------

/**
 * Merges a freshly-discovered entry with any prior entry of the same
 * composite key (`<name>:<paneId>` when paneId is set, `<name>` otherwise).
 * Discovery only knows tabTitle / status / updatedAt — it has no signal for
 * cwd, transcriptPath, claudeResumeId, or lastPrompt. Those fields are
 * populated by the Stop/Notification hook (hook-snapshot.ts). Without this
 * merge, every `snapshotNow` call would silently clobber the hook-captured
 * cwd / resume-id with empty/null.
 */
export function mergeDiscoveredEntry(
	prior: SnapshotEntry | undefined,
	discovered: SnapshotEntry,
): SnapshotEntry {
	if (!prior) return discovered;
	return {
		name: discovered.name,
		// Hook-captured paneId is more authoritative (per-pane env var) than
		// discovery's focused-client guess; preserve it unless missing.
		paneId: prior.paneId ?? discovered.paneId,
		tabTitle: discovered.tabTitle ?? prior.tabTitle,
		status: discovered.status,
		updatedAt: discovered.updatedAt,
		// Hook-populated fields win unless the prior had no value.
		cwd: prior.cwd && prior.cwd.length > 0 ? prior.cwd : discovered.cwd,
		transcriptPath: prior.transcriptPath ?? discovered.transcriptPath,
		claudeResumeId: prior.claudeResumeId ?? discovered.claudeResumeId,
		lastPrompt: prior.lastPrompt ?? discovered.lastPrompt,
	};
}

/**
 * Discovers every live zellij session and persists one SnapshotEntry per
 * (session, paneId) tuple. Merges with the prior registry per composite key
 * so hook-captured cwd / resume-id / transcript / paneId are preserved
 * across discovery passes. Returns the entries actually written.
 */
export async function snapshotNow(deps: SnapshotNowDeps): Promise<readonly SnapshotEntry[]> {
	const discoveryOpts: {
		zellijRoot?: string;
		spawner?: Spawner;
		now?: () => Date;
	} = {};
	if (deps.zellijRoot !== undefined) discoveryOpts.zellijRoot = deps.zellijRoot;
	if (deps.spawner !== undefined) discoveryOpts.spawner = deps.spawner;
	if (deps.now !== undefined) discoveryOpts.now = deps.now;
	const discovered = await discoverSnapshotEntries(discoveryOpts);
	// PASS 1 — pgrep/lsof/ps enrichment. Strongest signal: matches each
	// discovery entry to a live claude PID by (ZELLIJ_SESSION_NAME,
	// ZELLIJ_PANE_ID) read from the proc's env, then pins resume-id from
	// the cmdline's `--resume <uuid>` flag (if present) or the newest
	// unassigned transcript in the proc's cwd.
	const processEnriched =
		deps.processEnrich === false
			? discovered
			: await enrichEntriesWithProcesses(discovered, deps.processEnrich ?? {});
	// PASS 2 — for any entry still lacking a resume id (e.g. sessions whose
	// pane env vars don't match an active claude proc), fall back to the
	// session-name-based transcript heuristic.
	const enriched =
		deps.enrich === false
			? processEnriched
			: await enrichEntries(processEnriched, deps.enrich ?? {});
	const priorAll = await readAllSnapshots(deps.dataDir);
	const priorByKey = new Map(priorAll.map((e) => [entryKey(e), e]));
	const persist = deps.persist ?? snapshotSession;
	const merged: SnapshotEntry[] = [];
	for (const entry of enriched) {
		const out = mergeDiscoveredEntry(priorByKey.get(entryKey(entry)), entry);
		await persist(deps.dataDir, out);
		merged.push(out);
	}
	return merged;
}

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

export type RestorePlan =
	| { readonly kind: "not-found"; readonly sessionName: string }
	| {
			readonly kind: "spawn-session";
			// One zellij session can host multiple Claude panes — every
			// resumable entry sharing this name is restored in one pass so we
			// don't silently leave panes at a bare shell prompt.
			readonly entries: readonly SnapshotEntry[];
	  };

/**
 * Reads the registry and returns a plan that names every resumable entry
 * matching `sessionName`. Multi-pane sessions yield one plan with multiple
 * entries. Pure — caller drives the spawner.
 */
export async function planRestore(args: {
	dataDir: string;
	sessionName: string;
}): Promise<RestorePlan> {
	const all = await listResumable(args.dataDir);
	const entries = all.filter((e) => e.name === args.sessionName);
	if (entries.length === 0) return { kind: "not-found", sessionName: args.sessionName };
	return { kind: "spawn-session", entries };
}

/**
 * Executes a restore plan. For each entry, focuses the target pane (when
 * paneId is set, via the shared writeToPane helper) and injects
 * `claude --resume <id>`. NEVER kills anything. Idempotent — re-running
 * against a live session simply re-injects the resume command.
 *
 * When an entry has no paneId, falls back to plain `zellij action
 * write-chars`, which targets the focused pane. That preserves behaviour
 * for single-pane / legacy registries.
 */
export async function executeRestore(deps: RestoreDeps): Promise<RestorePlan> {
	const plan = await planRestore({ dataDir: deps.dataDir, sessionName: deps.sessionName });
	if (plan.kind === "not-found") return plan;

	// Ensure the zellij session is alive once per restore. `zellij --session
	// <name>` attaches when the socket exists, otherwise creates the session.
	const first = plan.entries[0];
	if (first) {
		await deps.spawn(["zellij", "--session", first.name, "options", "--theme", "default"]);
	}

	for (const entry of plan.entries) {
		const haveCwd = entry.cwd && entry.cwd.length > 0;
		if (!haveCwd && deps.onWarn) {
			deps.onWarn(
				`restore "${entryKey(entry)}": no cwd captured; falling back to ${process.cwd()}. Resume will run from the wrong directory — let the Stop/Notification hook fire at least once before restoring.`,
			);
		}
		const cwd = haveCwd ? entry.cwd : process.cwd();
		const text = `cd ${cwd} && claude --resume ${entry.claudeResumeId}\n`;

		if (entry.paneId) {
			// Per-pane restore — focus then write via the shared helper.
			const result = await writeToPane({
				session: entry.name,
				paneId: entry.paneId,
				text,
				spawn: deps.spawn,
			});
			if (!result.focusedOk && deps.onWarn) {
				deps.onWarn(`restore "${entryKey(entry)}": focus-pane-id failed; skipping inject.`);
			}
			continue;
		}

		// Fallback: legacy entries without paneId — write to focused pane.
		await deps.spawn(["zellij", "--session", entry.name, "action", "write-chars", text]);
	}

	return plan;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

/**
 * Reads every entry in the registry, regardless of status / resumability.
 * Returns [] if the registry file is missing or empty. Used by `pier-snapshot
 * list --all` so the user can audit what's been captured even before
 * claudeResumeId enrichment lands.
 */
export async function readAllSnapshots(dataDir: string): Promise<readonly SnapshotEntry[]> {
	const path = join(dataDir, "registry.json");
	const file = Bun.file(path);
	if (!(await file.exists())) return [];
	try {
		const raw = await file.text();
		const parsed = JSON.parse(raw) as Record<
			string,
			{
				name: string;
				paneId?: string | null;
				tabTitle: string | null;
				cwd: string;
				transcriptPath: string | null;
				claudeResumeId: string | null;
				lastPrompt: string | null;
				status: SnapshotEntry["status"];
				updatedAt: string;
			}
		>;
		return Object.values(parsed).map((j) => ({
			name: j.name,
			paneId: typeof j.paneId === "string" && j.paneId.length > 0 ? j.paneId : null,
			tabTitle: j.tabTitle,
			cwd: j.cwd,
			transcriptPath: j.transcriptPath,
			claudeResumeId: j.claudeResumeId,
			lastPrompt: j.lastPrompt,
			status: j.status,
			updatedAt: new Date(j.updatedAt),
		}));
	} catch {
		return [];
	}
}

/**
 * Returns the resumable subset (default) or every entry (when `all: true`),
 * plus a human-readable summary line per entry. The caller (CLI) prints it.
 */
export async function listSnapshots(
	dataDir: string,
	opts: { all?: boolean } = {},
): Promise<{ entries: readonly SnapshotEntry[]; lines: readonly string[] }> {
	const entries = opts.all ? await readAllSnapshots(dataDir) : await listResumable(dataDir);
	const lines = entries.map(
		(e) =>
			`${entryKey(e).padEnd(28)} ${e.status.padEnd(8)} resume=${e.claudeResumeId ?? "-"} cwd=${e.cwd || "-"}`,
	);
	return { entries, lines };
}

// re-export so the CLI wrapper has one import path
export { defaultSpawner };
