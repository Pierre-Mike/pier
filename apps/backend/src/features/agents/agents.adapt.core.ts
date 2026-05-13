/**
 * Pure core: maps daemon state.json content → AgentRow for the frontend.
 * No I/O, no Effect, no side effects — only data transformation.
 */

export type AgentGroup = "working" | "needs-input" | "completed";

export interface AgentRow {
	readonly shortId: string;
	readonly group: AgentGroup;
	readonly name: string;
	readonly needs: string | null;
	readonly output: string | null;
	readonly cwd: string;
	readonly updatedAt: string;
	readonly cliVersion: string;
}

/**
 * Maps a daemon state string to an AgentGroup.
 *
 * working | idle → "working"      (dispatched, running or about to run)
 * blocked        → "needs-input"  (paused, waiting for user reply)
 * completed | failed | stopped → "completed"
 */
const stateToGroup = (state: string): AgentGroup => {
	switch (state) {
		case "working":
		case "idle":
			return "working";
		case "blocked":
			return "needs-input";
		case "completed":
		case "failed":
		case "stopped":
			return "completed";
		default:
			// Unknown states treated as working (forward-compatible)
			return "working";
	}
};

/**
 * Converts a raw state.json record (keyed by short agent ID) to an AgentRow.
 * Accepts `Record<string, unknown>` so callers can pass JSON-parsed state
 * without asserting a precise shape — validation is optional (done in
 * agents.daemon.repo for Effect paths; tests pass raw objects directly).
 */
export const stateToAgentRow = (shortId: string, state: Record<string, unknown>): AgentRow => {
	const rawState = typeof state["state"] === "string" ? state["state"] : "idle";
	const rawName = typeof state["name"] === "string" ? state["name"] : null;
	const rawIntent = typeof state["intent"] === "string" ? state["intent"] : null;
	const name = rawName ?? rawIntent ?? shortId;
	const needs = typeof state["needs"] === "string" ? state["needs"] : null;
	const output = typeof state["output"] === "string" ? state["output"] : null;
	const cwd = typeof state["cwd"] === "string" ? state["cwd"] : "";
	const updatedAt = typeof state["updatedAt"] === "string" ? state["updatedAt"] : "";
	const cliVersion = typeof state["cliVersion"] === "string" ? state["cliVersion"] : "";

	return {
		shortId,
		group: stateToGroup(rawState),
		name,
		needs,
		output,
		cwd,
		updatedAt,
		cliVersion,
	};
};
