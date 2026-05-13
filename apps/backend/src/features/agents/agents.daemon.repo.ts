/**
 * Effect service: reads roster.json and state.json files from the Claude daemon
 * on-disk state. No CLI invocations — pure filesystem reads.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { type AgentRow, stateToAgentRow } from "./agents.adapt.core.ts";
import { decodeRoster } from "./agents.schema.ts";

const CLAUDE_DIR = join(homedir(), ".claude");
const ROSTER_PATH = join(CLAUDE_DIR, "daemon", "roster.json");
const JOBS_DIR = join(CLAUDE_DIR, "jobs");

// ---------------------------------------------------------------------------
// Minimum CLI version required for agent view
// ---------------------------------------------------------------------------

const MIN_CLI_VERSION = "2.1.139";

const semverGte = (a: string, b: string): boolean => {
	const parse = (s: string): readonly number[] => s.split(".").map((n) => Number.parseInt(n, 10));
	const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
	const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
	if (aMaj !== bMaj) return aMaj > bMaj;
	if (aMin !== bMin) return aMin > bMin;
	return aPatch >= bPatch;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface AgentDaemonService {
	/** Read roster.json. Returns null if file is absent. */
	readonly readRoster: () => Effect.Effect<Record<string, unknown> | null, never, never>;
	/** Read state.json for a given short ID. Returns null if absent or unreadable. */
	readonly readState: (
		shortId: string,
	) => Effect.Effect<Record<string, unknown> | null, never, never>;
	/** Read list of all AgentRows from current roster + state files. */
	readonly listAgents: () => Effect.Effect<AgentRow[] | { _tag: "DaemonAbsent" }, never, never>;
}

export const AgentDaemon = Context.GenericTag<AgentDaemonService>("AgentDaemon");

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

const readRosterLive = (): Effect.Effect<Record<string, unknown> | null, never, never> =>
	Effect.promise(async () => {
		try {
			const raw = await readFile(ROSTER_PATH, "utf-8");
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	});

const readStateLive = (
	shortId: string,
): Effect.Effect<Record<string, unknown> | null, never, never> =>
	Effect.promise(async () => {
		const statePath = join(JOBS_DIR, shortId, "state.json");
		try {
			const raw = await readFile(statePath, "utf-8");
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	});

// ---------------------------------------------------------------------------
// Shared: build AgentRow[] from a decoded roster + a readState function
// ---------------------------------------------------------------------------

const buildRowsFromRoster = (
	workers: Record<string, { cliVersion: string } | undefined>,
	readStateFn: (shortId: string) => Effect.Effect<Record<string, unknown> | null, never, never>,
): Effect.Effect<AgentRow[], never, never> =>
	Effect.gen(function* () {
		const rows: AgentRow[] = [];
		for (const shortId of Object.keys(workers)) {
			const worker = workers[shortId];
			if (!worker || !semverGte(worker.cliVersion, MIN_CLI_VERSION)) continue;
			const stateRaw = yield* readStateFn(shortId);
			if (stateRaw === null) continue;
			rows.push(stateToAgentRow(shortId, stateRaw));
		}
		return rows;
	});

const listAgentsLive = (): Effect.Effect<AgentRow[] | { _tag: "DaemonAbsent" }, never, never> =>
	Effect.gen(function* () {
		const rosterRaw = yield* readRosterLive();
		if (rosterRaw === null) return { _tag: "DaemonAbsent" as const };

		const decoded = decodeRoster(rosterRaw);
		if (decoded._tag === "Left") return { _tag: "DaemonAbsent" as const };

		return yield* buildRowsFromRoster(decoded.right.workers, readStateLive);
	});

export const makeAgentDaemonLive = (): Layer.Layer<AgentDaemonService> =>
	Layer.succeed(AgentDaemon, {
		readRoster: readRosterLive,
		readState: readStateLive,
		listAgents: listAgentsLive,
	});

// ---------------------------------------------------------------------------
// Test stub — injectable via makeAgentsTestApp
// ---------------------------------------------------------------------------

export const makeAgentDaemonTest = (opts: {
	readonly rosterJson: unknown;
	readonly stateByShortId: Record<string, unknown>;
}): Layer.Layer<AgentDaemonService> => {
	const { rosterJson, stateByShortId } = opts;

	const readRoster = (): Effect.Effect<Record<string, unknown> | null, never, never> =>
		Effect.sync(() => {
			if (rosterJson === null) return null;
			return rosterJson as Record<string, unknown>;
		});

	const readState = (
		shortId: string,
	): Effect.Effect<Record<string, unknown> | null, never, never> =>
		Effect.sync(() => {
			const state = stateByShortId[shortId];
			return state !== undefined ? (state as Record<string, unknown>) : null;
		});

	const listAgents = (): Effect.Effect<AgentRow[] | { _tag: "DaemonAbsent" }, never, never> =>
		Effect.gen(function* () {
			const rosterRaw = yield* readRoster();
			if (rosterRaw === null) return { _tag: "DaemonAbsent" as const };

			const decoded = decodeRoster(rosterRaw);
			if (decoded._tag === "Left") return { _tag: "DaemonAbsent" as const };

			return yield* buildRowsFromRoster(decoded.right.workers, readState);
		});

	return Layer.succeed(AgentDaemon, { readRoster, readState, listAgents });
};

// ---------------------------------------------------------------------------
// Roster path export (used by stream routes)
// ---------------------------------------------------------------------------

export { JOBS_DIR, ROSTER_PATH };

// ---------------------------------------------------------------------------
// Synchronous roster check (for express-style 409 gate before Effect.gen)
// ---------------------------------------------------------------------------

export const rosterExistsSync = (): boolean => {
	try {
		readFileSync(ROSTER_PATH);
		return true;
	} catch {
		return false;
	}
};
