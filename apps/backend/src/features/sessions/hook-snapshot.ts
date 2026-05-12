/**
 * spec 049 — wire Claude Code Stop/Notification hooks to snapshotSession.
 *
 * Hooks fire inside a live Claude Code session and arrive on stdin as JSON.
 * The hook script reads the payload, builds a SnapshotEntry, and persists it
 * via snapshotSession so the registry continuously reflects what's running.
 *
 * Fail-safe discipline: hooks must NEVER fail-close on the user's Claude
 * session. Every function here returns a partial entry on error rather than
 * throwing; the runnable wrapper exits 0 regardless.
 */

import type { SnapshotEntry } from "./snapshot.ts";
import { snapshotSession } from "./snapshot.ts";

// ---------------------------------------------------------------------------
// Hook payload shape (subset we rely on — extras are ignored)
// ---------------------------------------------------------------------------

export type HookPayload = {
	readonly hook_event_name: "Stop" | "Notification" | string;
	readonly session_id?: string;
	readonly transcript_path?: string;
	readonly cwd?: string;
	readonly message?: string;
};

export type HookEnv = {
	readonly ZELLIJ_SESSION_NAME?: string;
	readonly ZELLIJ?: string;
};

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

/**
 * Derive the zellij session name a hook is running under. The Claude process
 * inherits `ZELLIJ_SESSION_NAME` from the shell zellij spawned. If neither is
 * present we fall back to a synthetic name keyed by the Claude session_id, so
 * the entry still lands and recovery scripts can find it.
 */
export function deriveZellijSessionName(payload: HookPayload, env: HookEnv): string {
	if (env.ZELLIJ_SESSION_NAME && env.ZELLIJ_SESSION_NAME.length > 0) {
		return env.ZELLIJ_SESSION_NAME;
	}
	if (payload.session_id) return `claude-${payload.session_id.slice(0, 12)}`;
	return "unknown";
}

/**
 * Map hook event name → SnapshotStatus.
 *   Stop          → active   (Claude finished its turn cleanly, awaiting user)
 *   Notification  → active   (Claude needs attention but is alive)
 *   anything else → unknown
 */
export function statusForEvent(name: string): SnapshotEntry["status"] {
	if (name === "Stop" || name === "Notification") return "active";
	return "unknown";
}

/**
 * Builds a SnapshotEntry from a hook payload. `now` is injectable for
 * reproducible tests. All zellij/discovery fields stay as the payload values
 * — enrichment (panes, running commands) is the discovery module's job.
 */
export function buildEntryFromHook(args: {
	payload: HookPayload;
	env: HookEnv;
	now?: Date;
}): SnapshotEntry {
	const { payload, env } = args;
	const now = args.now ?? new Date();
	const message = typeof payload.message === "string" ? payload.message : null;
	return {
		name: deriveZellijSessionName(payload, env),
		tabTitle: null,
		cwd: typeof payload.cwd === "string" ? payload.cwd : "",
		transcriptPath: typeof payload.transcript_path === "string" ? payload.transcript_path : null,
		claudeResumeId: typeof payload.session_id === "string" ? payload.session_id : null,
		lastPrompt: message,
		status: statusForEvent(payload.hook_event_name),
		updatedAt: now,
	};
}

// ---------------------------------------------------------------------------
// Imperative shell — persist
// ---------------------------------------------------------------------------

export type PersistResult =
	| { readonly ok: true; readonly entry: SnapshotEntry }
	| { readonly ok: false; readonly error: string };

/**
 * Persists a hook-derived entry to <dataDir>/registry.json. Never throws —
 * returns `{ok:false, error}` on failure so the runnable can decide whether
 * to log to stderr or stay silent.
 */
export async function persistHookSnapshot(args: {
	payload: HookPayload;
	env: HookEnv;
	dataDir: string;
	now?: Date;
}): Promise<PersistResult> {
	try {
		const entry = buildEntryFromHook({
			payload: args.payload,
			env: args.env,
			now: args.now ?? new Date(),
		});
		await snapshotSession(args.dataDir, entry);
		return { ok: true, entry };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
