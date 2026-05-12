/**
 * spec 047 — Zellij session snapshot registry
 *
 * FCIS pattern:
 *   Core  — pure types + functions (upsertEntry, filterResumable)
 *   Shell — I/O functions (snapshotSession, listResumable)
 *
 * Registry file: <dataDir>/registry.json
 * History file:  <dataDir>/history.ndjson
 *
 * Writes are atomic: serialise → write to .tmp → fs.rename → .tmp gone.
 */

import { renameSync, writeFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type SnapshotStatus = "active" | "crashed" | "unknown";

export type SnapshotEntry = {
	readonly name: string;
	readonly paneId: string | null;
	readonly tabTitle: string | null;
	readonly cwd: string;
	readonly transcriptPath: string | null;
	readonly claudeResumeId: string | null;
	readonly lastPrompt: string | null;
	readonly status: SnapshotStatus;
	readonly updatedAt: Date;
};

export type SnapshotRegistry = Readonly<Record<string, SnapshotEntry>>;

/**
 * Registry key for an entry. One zellij session can host multiple Claude
 * panes; keying by `<name>:<paneId>` (when paneId is known) prevents the
 * hooks fired from different panes in the same session from clobbering
 * one another. Entries with no paneId (e.g. legacy data or discovery's
 * single-pane fallback) key by `name` alone — preserves backward compat.
 */
export function entryKey(entry: Pick<SnapshotEntry, "name" | "paneId">): string {
	return entry.paneId ? `${entry.name}:${entry.paneId}` : entry.name;
}

// ---------------------------------------------------------------------------
// Core pure functions
// ---------------------------------------------------------------------------

/**
 * Returns a new registry with `entry` inserted or replaced. Key is composite
 * — see entryKey. Does NOT mutate the input registry.
 */
export function upsertEntry(registry: SnapshotRegistry, entry: SnapshotEntry): SnapshotRegistry {
	return { ...registry, [entryKey(entry)]: entry };
}

/**
 * Returns entries whose status is "active" or "crashed" and whose
 * claudeResumeId is non-null. Order is not guaranteed.
 */
export function filterResumable(registry: SnapshotRegistry): readonly SnapshotEntry[] {
	return Object.values(registry).filter(
		(e): e is SnapshotEntry =>
			(e.status === "active" || e.status === "crashed") && e.claudeResumeId !== null,
	);
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

/**
 * JSON-serialisable shape for a SnapshotEntry.
 * Dates are stored as ISO strings so JSON.parse can round-trip them.
 */
type SnapshotEntryJson = {
	readonly name: string;
	readonly paneId?: string | null;
	readonly tabTitle: string | null;
	readonly cwd: string;
	readonly transcriptPath: string | null;
	readonly claudeResumeId: string | null;
	readonly lastPrompt: string | null;
	readonly status: SnapshotStatus;
	readonly updatedAt: string;
};

function entryToJson(entry: SnapshotEntry): SnapshotEntryJson {
	return {
		name: entry.name,
		paneId: entry.paneId,
		tabTitle: entry.tabTitle,
		cwd: entry.cwd,
		transcriptPath: entry.transcriptPath,
		claudeResumeId: entry.claudeResumeId,
		lastPrompt: entry.lastPrompt,
		status: entry.status,
		updatedAt: entry.updatedAt.toISOString(),
	};
}

function jsonToEntry(json: SnapshotEntryJson): SnapshotEntry {
	return {
		name: json.name,
		// `paneId` may be missing on legacy JSON entries written before this PR;
		// treat absent / undefined / empty as null so old registries still parse.
		paneId: typeof json.paneId === "string" && json.paneId.length > 0 ? json.paneId : null,
		tabTitle: json.tabTitle,
		cwd: json.cwd,
		transcriptPath: json.transcriptPath,
		claudeResumeId: json.claudeResumeId,
		lastPrompt: json.lastPrompt,
		status: json.status,
		updatedAt: new Date(json.updatedAt),
	};
}

function registryToJson(registry: SnapshotRegistry): Record<string, SnapshotEntryJson> {
	const out: Record<string, SnapshotEntryJson> = {};
	for (const [key, entry] of Object.entries(registry)) {
		out[key] = entryToJson(entry);
	}
	return out;
}

function jsonToRegistry(raw: Record<string, SnapshotEntryJson>): SnapshotRegistry {
	const out: Record<string, SnapshotEntry> = {};
	for (const [key, json] of Object.entries(raw)) {
		out[key] = jsonToEntry(json);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Imperative shell
// ---------------------------------------------------------------------------

const REGISTRY_FILE = "registry.json";
const REGISTRY_TMP = "registry.json.tmp";
const HISTORY_FILE = "history.ndjson";

async function readRegistry(dataDir: string): Promise<SnapshotRegistry> {
	const path = join(dataDir, REGISTRY_FILE);
	try {
		const file = Bun.file(path);
		if (!(await file.exists())) return {};
		const raw = await file.text();
		const parsed = JSON.parse(raw) as Record<string, SnapshotEntryJson>;
		return jsonToRegistry(parsed);
	} catch {
		return {};
	}
}

async function writeRegistryAtomic(dataDir: string, registry: SnapshotRegistry): Promise<void> {
	const tmpPath = join(dataDir, REGISTRY_TMP);
	const finalPath = join(dataDir, REGISTRY_FILE);
	const json = JSON.stringify(registryToJson(registry), null, 2);
	// Use fully synchronous write + rename to ensure both ops complete before
	// returning. Async writeFile/rename on Linux under Bun can report success
	// before the OS commits the inode, causing subsequent reads to fail ENOENT.
	writeFileSync(tmpPath, json, "utf-8");
	renameSync(tmpPath, finalPath);
}

async function appendHistory(dataDir: string, entry: SnapshotEntry): Promise<void> {
	const histPath = join(dataDir, HISTORY_FILE);
	const line = `${JSON.stringify({
		ts: entry.updatedAt.toISOString(),
		name: entry.name,
		tabTitle: entry.tabTitle,
		cwd: entry.cwd,
		transcriptPath: entry.transcriptPath,
		claudeResumeId: entry.claudeResumeId,
		lastPrompt: entry.lastPrompt,
		status: entry.status,
	})}\n`;
	await appendFile(histPath, line, "utf-8");
}

/**
 * Persists `entry` into the registry at `<dataDir>/registry.json`.
 *
 * 1. Reads the existing registry (or starts empty).
 * 2. Upserts the entry (pure).
 * 3. Writes the updated registry atomically via tmp-then-rename.
 * 4. Appends a history line to `<dataDir>/history.ndjson`.
 *
 * `dataDir` is created if it does not exist.
 */
export async function snapshotSession(dataDir: string, entry: SnapshotEntry): Promise<void> {
	await mkdir(dataDir, { recursive: true });
	const registry = await readRegistry(dataDir);
	const updated = upsertEntry(registry, entry);
	await writeRegistryAtomic(dataDir, updated);
	await appendHistory(dataDir, entry);
}

/**
 * Reads the registry from `<dataDir>/registry.json` and returns all entries
 * that are resumable (status active or crashed, claudeResumeId non-null).
 *
 * Returns `[]` if the registry file does not exist or is empty.
 */
export async function listResumable(dataDir: string): Promise<readonly SnapshotEntry[]> {
	const registry = await readRegistry(dataDir);
	return filterResumable(registry);
}
