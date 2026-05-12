/**
 * spec 050 — CLI / orchestrator entry point for snapshot + restore.
 *
 * Pure logic lives here so it can be unit-tested without spawning zellij or
 * touching the filesystem. The thin `scripts/pier-snapshot.ts` wrapper parses
 * argv and calls these functions with injectable I/O seams.
 */

import { join } from "node:path";
import { defaultSpawner, discoverSnapshotEntries, type Spawner } from "./discovery.ts";
import { listResumable, type SnapshotEntry, snapshotSession } from "./snapshot.ts";

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
 * Merges a freshly-discovered entry with any prior entry of the same name.
 * Discovery only knows tabTitle / status / updatedAt — it has no signal for
 * cwd, transcriptPath, claudeResumeId, or lastPrompt. Those fields are
 * populated by the Stop/Notification hook (hook-snapshot.ts). Without this
 * merge, every `snapshotNow` call would silently clobber the hook-captured
 * cwd / resume-id with empty/null, and `restore` would fall back to
 * process.cwd() and skip the claude resume — the exact recovery-drill bug.
 */
export function mergeDiscoveredEntry(
	prior: SnapshotEntry | undefined,
	discovered: SnapshotEntry,
): SnapshotEntry {
	if (!prior) return discovered;
	return {
		name: discovered.name,
		// Discovery wins for fields it actually populates.
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
 * session via snapshotSession. Merges with the prior registry per-name so
 * hook-captured cwd / resume-id / transcript are preserved across discovery
 * passes. Returns the entries actually written.
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
	const priorAll = await readAllSnapshots(deps.dataDir);
	const priorByName = new Map(priorAll.map((e) => [e.name, e]));
	const persist = deps.persist ?? snapshotSession;
	const merged: SnapshotEntry[] = [];
	for (const entry of discovered) {
		const out = mergeDiscoveredEntry(priorByName.get(entry.name), entry);
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
			readonly entry: SnapshotEntry;
			readonly claudeResume: string | null;
	  };

/**
 * Reads the registry, finds the entry matching `sessionName`, and returns a
 * plan describing what restore would do. Pure — caller drives the spawner.
 */
export async function planRestore(args: {
	dataDir: string;
	sessionName: string;
}): Promise<RestorePlan> {
	const all = await listResumable(args.dataDir);
	const entry = all.find((e) => e.name === args.sessionName);
	if (!entry) return { kind: "not-found", sessionName: args.sessionName };
	return { kind: "spawn-session", entry, claudeResume: entry.claudeResumeId };
}

/**
 * Executes a restore plan: spawns the zellij session at the saved cwd, then
 * (if claudeResumeId is present) injects `claude --resume <id>` via
 * `zellij action write-chars`. NEVER kills anything. Idempotent — re-running
 * against a live session simply re-injects the resume command.
 */
export async function executeRestore(deps: RestoreDeps): Promise<RestorePlan> {
	const plan = await planRestore({ dataDir: deps.dataDir, sessionName: deps.sessionName });
	if (plan.kind === "not-found") return plan;

	const { entry } = plan;
	const haveCwd = entry.cwd && entry.cwd.length > 0;
	if (!haveCwd && deps.onWarn) {
		deps.onWarn(
			`restore "${entry.name}": no cwd captured for this session; falling back to ${process.cwd()}. Resume will run from the wrong directory — let the Stop/Notification hook fire at least once before restoring.`,
		);
	}
	const cwd = haveCwd ? entry.cwd : process.cwd();

	// Step 1: ensure the zellij session exists. `zellij --session <name>` is
	// safe to call when the session already exists — it attaches as a new
	// client instead of creating a duplicate.
	await deps.spawn(["zellij", "--session", entry.name, "options", "--theme", "default"]);

	// Step 2: if we have a Claude resume id, inject the resume command.
	if (entry.claudeResumeId) {
		await deps.spawn([
			"zellij",
			"--session",
			entry.name,
			"action",
			"write-chars",
			`cd ${cwd} && claude --resume ${entry.claudeResumeId}\n`,
		]);
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
			`${e.name.padEnd(24)} ${e.status.padEnd(8)} resume=${e.claudeResumeId ?? "-"} cwd=${e.cwd || "-"}`,
	);
	return { entries, lines };
}

// re-export so the CLI wrapper has one import path
export { defaultSpawner };
