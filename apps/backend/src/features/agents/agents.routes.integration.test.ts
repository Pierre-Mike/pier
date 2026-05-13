/**
 * Gate: integration tests for the agents feature routes.
 *
 * RED: agents.routes.ts does not exist yet. Dynamic imports will resolve to
 * empty objects, causing every test that calls the routes to fail.
 *
 * Covers:
 *  AC1: GET /api/agents returns 3 grouped AgentRow entries from fixture state
 *  AC2: POST /api/agents with stubbed CLI spawn returns { id, shortId }
 *  AC3: Schema decoder rejects malformed roster (drift protection)
 *  AC4: GET /api/agents returns 409 when roster.json is absent
 *
 * Uses fixture files from __fixtures__/ directory.
 * No live daemon required.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import type { AppBindings } from "../../platform/effect-handler.ts";

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dir, "__fixtures__");

const rosterFixture = JSON.parse(
	readFileSync(join(FIXTURES_DIR, "roster.fixture.json"), "utf-8"),
) as unknown;

const stateWorking = JSON.parse(
	readFileSync(join(FIXTURES_DIR, "state-working.fixture.json"), "utf-8"),
) as unknown;

const stateNeedsInput = JSON.parse(
	readFileSync(join(FIXTURES_DIR, "state-needs-input.fixture.json"), "utf-8"),
) as unknown;

const stateCompleted = JSON.parse(
	readFileSync(join(FIXTURES_DIR, "state-completed.fixture.json"), "utf-8"),
) as unknown;

// ---------------------------------------------------------------------------
// Type contracts
// ---------------------------------------------------------------------------

type AgentGroup = "working" | "needs-input" | "completed";

interface AgentRow {
	readonly shortId: string;
	readonly group: AgentGroup;
	readonly name: string;
	readonly needs: string | null;
	readonly output: string | null;
	readonly cwd: string;
	readonly updatedAt: string;
	readonly cliVersion: string;
}

interface DispatchResult {
	readonly id: string;
	readonly shortId: string;
}

type AgentsRouteModule = {
	agentsRoute?: {
		app: Hono<{ Bindings: AppBindings }>;
		testApp: Hono<{ Bindings: AppBindings }>;
	};
	makeAgentsTestApp?: (opts: {
		rosterJson: unknown;
		stateByShortId: Record<string, unknown>;
		spawnStdout?: string;
	}) => Hono<{ Bindings: AppBindings }>;
};

type AgentsSchemaModule = {
	decodeRoster?: (
		raw: unknown,
	) => { _tag: "Right"; right: unknown } | { _tag: "Left"; left: unknown };
};

// Dynamic imports — RED until implementation exists
const routesModule: AgentsRouteModule = await import("./agents.routes.ts").catch(() => ({}));
const schemaModule: AgentsSchemaModule = await import("./agents.schema.ts").catch(() => ({}));

// ---------------------------------------------------------------------------
// AC1 + AC4: GET /api/agents
// ---------------------------------------------------------------------------

describe("GET /api/agents", () => {
	test("AC1: returns 3 rows grouped correctly from fixture daemon state (1 working, 1 needs-input, 1 completed)", async () => {
		// RED: makeAgentsTestApp is undefined until agents.routes.ts is implemented
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: {
				abcd0001: stateWorking,
				abcd0002: stateNeedsInput,
				abcd0003: stateCompleted,
			},
		});

		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(200);

		const json = (await res.json()) as AgentRow[];
		expect(Array.isArray(json)).toBe(true);
		expect(json).toHaveLength(3);

		const working = json.filter((r) => r.group === "working");
		const needsInput = json.filter((r) => r.group === "needs-input");
		const completed = json.filter((r) => r.group === "completed");

		expect(working).toHaveLength(1);
		expect(needsInput).toHaveLength(1);
		expect(completed).toHaveLength(1);

		// Verify short IDs match fixture data
		const workingRow = working[0];
		const needsRow = needsInput[0];
		const completedRow = completed[0];

		expect(workingRow?.shortId).toBe("abcd0001");
		expect(needsRow?.shortId).toBe("abcd0002");
		expect(completedRow?.shortId).toBe("abcd0003");
	});

	test("AC1: each row has required AgentRow fields (shortId, group, name, needs, output, cwd, updatedAt, cliVersion)", async () => {
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: {
				abcd0001: stateWorking,
				abcd0002: stateNeedsInput,
				abcd0003: stateCompleted,
			},
		});

		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(200);

		const json = (await res.json()) as AgentRow[];
		for (const row of json) {
			expect(typeof row.shortId).toBe("string");
			expect(["working", "needs-input", "completed"]).toContain(row.group);
			expect(typeof row.name).toBe("string");
			expect(row.needs === null || typeof row.needs === "string").toBe(true);
			expect(row.output === null || typeof row.output === "string").toBe(true);
			expect(typeof row.cwd).toBe("string");
			expect(typeof row.updatedAt).toBe("string");
			expect(typeof row.cliVersion).toBe("string");
		}
	});

	test("AC4: returns 409 when roster.json is absent (daemon not running)", async () => {
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: null, // null signals absent roster
			stateByShortId: {},
		});

		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(409);
	});
});

// ---------------------------------------------------------------------------
// AC2: POST /api/agents (dispatch)
// ---------------------------------------------------------------------------

describe("POST /api/agents", () => {
	test("AC2: returns { id, shortId } when spawn outputs 'backgrounded · abcd1234'", async () => {
		// RED: makeAgentsTestApp is undefined until agents.routes.ts is implemented
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: {},
			spawnStdout: "backgrounded · abcd1234",
		});

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: "implement the feature" }),
		});
		expect(res.status).toBe(200);

		const json = (await res.json()) as DispatchResult;
		expect(typeof json.id).toBe("string");
		expect(json.shortId).toBe("abcd1234");
	});

	test("AC2: returns 409 when roster.json is absent", async () => {
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: null,
			stateByShortId: {},
		});

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: "implement the feature" }),
		});
		expect(res.status).toBe(409);
	});

	test("AC2: returns 400 when prompt is missing", async () => {
		expect(routesModule.makeAgentsTestApp).toBeDefined();
		if (!routesModule.makeAgentsTestApp) return;

		const app = routesModule.makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: {},
			spawnStdout: "backgrounded · abcd5678",
		});

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// AC3: Schema decoder rejects malformed roster (drift protection)
// ---------------------------------------------------------------------------

describe("Roster schema decoder", () => {
	test("AC3: decodeRoster accepts valid roster with workers map", () => {
		// RED: decodeRoster is undefined until agents.schema.ts is implemented
		expect(schemaModule.decodeRoster).toBeDefined();
		if (!schemaModule.decodeRoster) return;

		const result = schemaModule.decodeRoster(rosterFixture);
		expect(result._tag).toBe("Right");
	});

	test("AC3: decodeRoster rejects roster missing 'workers' field", () => {
		expect(schemaModule.decodeRoster).toBeDefined();
		if (!schemaModule.decodeRoster) return;

		const malformed = { supervisorPid: 999 }; // missing 'workers'
		const result = schemaModule.decodeRoster(malformed);
		expect(result._tag).toBe("Left");
	});

	test("AC3: decodeRoster rejects non-object roster", () => {
		expect(schemaModule.decodeRoster).toBeDefined();
		if (!schemaModule.decodeRoster) return;

		const result = schemaModule.decodeRoster("not-an-object");
		expect(result._tag).toBe("Left");
	});

	test("AC3: decodeRoster rejects roster where workers is not a record", () => {
		expect(schemaModule.decodeRoster).toBeDefined();
		if (!schemaModule.decodeRoster) return;

		const result = schemaModule.decodeRoster({ workers: "not-a-record" });
		expect(result._tag).toBe("Left");
	});
});
