/**
 * spec 054 — backfill cwd / claudeResumeId / transcriptPath from
 * ~/.claude/projects/.
 *
 * Discovery has no signal for cwd or resume-id; hooks supply them but only
 * fire from sessions started AFTER the hook config landed. For pre-existing
 * sessions (or any session whose hook never ran), the only source of truth
 * is `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` — Claude Code's
 * own transcript file. The session-id encoded in the filename is exactly
 * the value `claude --resume <id>` consumes.
 *
 * Strategy per entry:
 *   1. If entry.cwd is set → use it (hook already captured truth).
 *   2. Else → guess `<HOME>/Github/<name>` and require the dir to exist.
 *   3. Encode cwd by replacing `/` with `-` (Claude Code's convention).
 *   4. Read `~/.claude/projects/<encoded>/`, take the newest *.jsonl
 *      whose mtime is within `recencyMs` (default 60 minutes).
 *   5. The filename minus `.jsonl` IS the resume id.
 *
 * Sessions with no matching project dir (e.g. zellij `default`,
 * `web_server_bus`) are left unenriched and stay `resume=-`. That's the
 * correct outcome — those zellij sockets host bare shells, not Claude.
 *
 * Multi-pane same-cwd is a known edge: we take the newest jsonl. Future
 * follow-up will split discovery entries one-per-pane and assign
 * top-K-by-mtime round-robin.
 */

import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SnapshotEntry } from "./snapshot.ts";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Encode an absolute cwd into Claude Code's projects-dir convention:
 *   /Users/x/Github/foo → -Users-x-Github-foo
 * Slashes become dashes; the leading slash becomes a leading dash. Literal
 * dashes in path components pass through unchanged, so decoding back is
 * ambiguous (we never need to) — we only encode one direction.
 */
export function encodeClaudeProjectName(cwd: string): string {
	return cwd.replaceAll("/", "-");
}

/**
 * Guess a cwd from a zellij session name when no cwd was captured by a hook.
 * Pier convention: every project in `~/Github/<name>` shares the zellij name
 * with the basename. Returns `null` when the candidate dir does not exist —
 * the caller leaves the entry unenriched.
 */
export function guessCwdFromSessionName(
	name: string,
	opts: { home?: string; githubRoot?: string } = {},
): string | null {
	const home = opts.home ?? homedir();
	const root = opts.githubRoot ?? join(home, "Github");
	const candidate = join(root, name);
	if (!existsSync(candidate)) return null;
	return candidate;
}

// ---------------------------------------------------------------------------
// Imperative shell — transcript lookup
// ---------------------------------------------------------------------------

export type TranscriptHit = {
	readonly sessionId: string;
	readonly transcriptPath: string;
	readonly mtimeMs: number;
	readonly otherRecent: number;
};

/**
 * Returns the newest *.jsonl in `<projectsRoot>/<encoded>/` whose mtime is
 * within `recencyMs` of `now`, plus a count of other transcripts in the
 * window. Returns null when the dir is missing / empty / all transcripts
 * are stale.
 *
 * `otherRecent > 0` is the multi-pane signal — multiple Claude sessions
 * recently touched the same cwd. The caller's contract is to take the
 * newest for now and surface the ambiguity for a future follow-up.
 */
export async function findRecentTranscript(args: {
	projectsRoot: string;
	encodedCwd: string;
	recencyMs: number;
	now: number;
}): Promise<TranscriptHit | null> {
	const dir = join(args.projectsRoot, args.encodedCwd);
	if (!existsSync(dir)) return null;
	let names: readonly string[];
	try {
		names = await readdir(dir);
	} catch {
		return null;
	}
	const cutoff = args.now - args.recencyMs;
	const candidates: Array<{ sessionId: string; path: string; mtimeMs: number }> = [];
	for (const fname of names) {
		if (!fname.endsWith(".jsonl")) continue;
		const sessionId = fname.slice(0, -".jsonl".length);
		if (sessionId.length === 0) continue;
		const path = join(dir, fname);
		try {
			const stat = statSync(path);
			if (stat.mtimeMs < cutoff) continue;
			candidates.push({ sessionId, path, mtimeMs: stat.mtimeMs });
		} catch {
			// File vanished between readdir and stat — skip.
		}
	}
	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
	const top = candidates[0];
	if (!top) return null;
	return {
		sessionId: top.sessionId,
		transcriptPath: top.path,
		mtimeMs: top.mtimeMs,
		otherRecent: candidates.length - 1,
	};
}

// ---------------------------------------------------------------------------
// Entry enrichment
// ---------------------------------------------------------------------------

export type EnrichOptions = {
	readonly projectsRoot?: string;
	readonly home?: string;
	readonly recencyMs?: number;
	readonly now?: () => number;
};

// 24 hours. The pattern "live zellij socket + most-recent transcript in the
// project dir" is the same heuristic the user runs manually (pgrep + lsof +
// newest jsonl). Idle Claude sessions can sit for hours awaiting user input;
// a 60-minute cap missed them. Sessions abandoned for >24h are unlikely to
// be recoverable anyway. Override with `PIER_TRANSCRIPT_RECENCY_MS`.
const DEFAULT_RECENCY_MS = 24 * 60 * 60 * 1000;

/**
 * Enriches one entry. If the entry already has cwd+resume, returns it
 * unchanged. Otherwise: tries to guess cwd (when missing), then looks up
 * the newest recent transcript and fills cwd / claudeResumeId /
 * transcriptPath. Always returns the entry — never throws on lookup
 * failure; an unenriched entry stays as-is.
 *
 * Skips entries that already carry a paneId — those are per-pane records
 * and the process-enrich pass (pgrep/lsof/ps) is the authoritative source
 * for them. Falling back to a session-name heuristic here would assign
 * the SAME transcript to every pane of a multi-pane session.
 */
export async function enrichEntry(
	entry: SnapshotEntry,
	opts: EnrichOptions = {},
): Promise<SnapshotEntry> {
	if (entry.claudeResumeId && entry.cwd && entry.cwd.length > 0) return entry;
	if (entry.paneId) return entry;

	const home = opts.home ?? homedir();
	const projectsRoot = opts.projectsRoot ?? join(home, ".claude", "projects");
	const recencyMs = opts.recencyMs ?? DEFAULT_RECENCY_MS;
	const now = (opts.now ?? (() => Date.now()))();

	const cwd =
		entry.cwd && entry.cwd.length > 0 ? entry.cwd : guessCwdFromSessionName(entry.name, { home });
	if (!cwd) return entry;

	const hit = await findRecentTranscript({
		projectsRoot,
		encodedCwd: encodeClaudeProjectName(cwd),
		recencyMs,
		now,
	});
	if (!hit) return entry;

	return {
		...entry,
		cwd: entry.cwd && entry.cwd.length > 0 ? entry.cwd : cwd,
		claudeResumeId: entry.claudeResumeId ?? hit.sessionId,
		transcriptPath: entry.transcriptPath ?? hit.transcriptPath,
	};
}

/**
 * Enrich every entry in a list. Sequential to keep filesystem read pressure
 * predictable; the list is typically <20 entries.
 */
export async function enrichEntries(
	entries: readonly SnapshotEntry[],
	opts: EnrichOptions = {},
): Promise<readonly SnapshotEntry[]> {
	const out: SnapshotEntry[] = [];
	for (const e of entries) {
		out.push(await enrichEntry(e, opts));
	}
	return out;
}
