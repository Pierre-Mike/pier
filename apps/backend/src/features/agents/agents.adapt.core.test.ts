/**
 * Gate: unit tests for agents.adapt.core.ts
 *
 * RED: agents.adapt.core.ts does not exist yet. The dynamic import below
 * will resolve to an empty object, causing every test that requires the
 * exported function to fail.
 *
 * These tests cover AC5 from proposal.md:
 *   stateToAgentRow maps daemon state strings to AgentRow groups.
 */

import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Type contract (what we expect agents.adapt.core.ts to export)
// ---------------------------------------------------------------------------

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

type AdaptCoreModule = {
	stateToAgentRow?: (shortId: string, state: Record<string, unknown>) => AgentRow;
};

// Dynamic import — RED until agents.adapt.core.ts is implemented
const adaptModule: AdaptCoreModule = await import("./agents.adapt.core.ts").catch(() => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseState: Record<string, unknown> = {
	state: "working",
	detail: "Reading files",
	tempo: "fast",
	inFlight: 2,
	needs: null,
	output: "Processing task...",
	children: [],
	linkScanOffset: 0,
	linkScanPath: null,
	template: null,
	respawnFlags: null,
	intent: "Implement the feature",
	sessionId: "session-abc",
	resumeSessionId: null,
	daemonShort: "abcd0001",
	cliVersion: "2.1.140",
	cwd: "/Users/pierre-mikel/Github/pier",
	createdAt: "2026-05-13T10:00:00.000Z",
	updatedAt: "2026-05-13T10:05:00.000Z",
	firstTerminalAt: "2026-05-13T10:00:01.000Z",
	originCwd: "/Users/pierre-mikel/Github/pier",
	backend: "anthropic",
	name: "Implement the feature",
	nameSource: "intent",
};

// ---------------------------------------------------------------------------
// AC5: stateToAgentRow group mapping
// ---------------------------------------------------------------------------

describe("stateToAgentRow", () => {
	test("maps state=working to group=working", () => {
		// RED: stateToAgentRow is undefined until agents.adapt.core.ts is implemented
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0001", { ...baseState, state: "working" });
		expect(row.group).toBe("working");
		expect(row.shortId).toBe("abcd0001");
	});

	test("maps state=blocked to group=needs-input", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0002", { ...baseState, state: "blocked" });
		expect(row.group).toBe("needs-input");
	});

	test("maps state=completed to group=completed", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0003", { ...baseState, state: "completed" });
		expect(row.group).toBe("completed");
	});

	test("maps state=failed to group=completed", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0004", { ...baseState, state: "failed" });
		expect(row.group).toBe("completed");
	});

	test("maps state=stopped to group=completed", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0005", { ...baseState, state: "stopped" });
		expect(row.group).toBe("completed");
	});

	test("maps state=idle to group=working (daemon says idle but agent is dispatched)", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0006", { ...baseState, state: "idle" });
		expect(row.group).toBe("working");
	});

	test("row exposes name, needs, output, cwd, updatedAt, cliVersion from state", () => {
		expect(adaptModule.stateToAgentRow).toBeDefined();
		if (!adaptModule.stateToAgentRow) return;

		const row = adaptModule.stateToAgentRow("abcd0001", {
			...baseState,
			state: "blocked",
			needs: "Please confirm",
			output: "Waiting...",
			name: "My agent task",
			cwd: "/home/user/project",
			updatedAt: "2026-05-13T10:10:00.000Z",
			cliVersion: "2.1.140",
		});
		expect(row.name).toBe("My agent task");
		expect(row.needs).toBe("Please confirm");
		expect(row.output).toBe("Waiting...");
		expect(row.cwd).toBe("/home/user/project");
		expect(row.updatedAt).toBe("2026-05-13T10:10:00.000Z");
		expect(row.cliVersion).toBe("2.1.140");
	});
});
