/**
 * Unit-level tests for agents.routes.ts (not the gate file).
 * These complement the integration tests by testing edge cases
 * with more direct control over the test layer.
 */

import { describe, expect, test } from "bun:test";
import rosterFixture from "./__fixtures__/roster.fixture.json";
import stateWorking from "./__fixtures__/state-working.fixture.json";
import { makeAgentsTestApp } from "./agents.routes.ts";

describe("GET /api/agents", () => {
	test("returns 200 with empty array when roster has no matching state files", async () => {
		const app = makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: {}, // no state files loaded
		});
		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as unknown[];
		expect(Array.isArray(json)).toBe(true);
		expect(json).toHaveLength(0);
	});

	test("returns 409 when roster is null", async () => {
		const app = makeAgentsTestApp({ rosterJson: null, stateByShortId: {} });
		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(409);
	});
});

describe("GET /api/agents/:id/peek", () => {
	test("returns 404 for unknown agent id", async () => {
		const app = makeAgentsTestApp({ rosterJson: rosterFixture, stateByShortId: {} });
		const res = await app.request("/api/agents/unknown-id/peek", { method: "GET" });
		expect(res.status).toBe(404);
	});

	test("returns 200 with state fields for known agent", async () => {
		const app = makeAgentsTestApp({
			rosterJson: rosterFixture,
			stateByShortId: { abcd0001: stateWorking },
		});
		const res = await app.request("/api/agents/abcd0001/peek", { method: "GET" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			state: string;
			needs: string | null;
			output: string | null;
			tail: string;
		};
		expect(json.state).toBe("working");
		expect(typeof json.tail).toBe("string");
	});
});

describe("POST /api/agents/:id/stop", () => {
	test("returns 204", async () => {
		const app = makeAgentsTestApp({ rosterJson: rosterFixture, stateByShortId: {} });
		const res = await app.request("/api/agents/abcd0001/stop", { method: "POST" });
		expect(res.status).toBe(204);
	});
});

describe("POST /api/agents/:id/respawn", () => {
	test("returns 204", async () => {
		const app = makeAgentsTestApp({ rosterJson: rosterFixture, stateByShortId: {} });
		const res = await app.request("/api/agents/abcd0001/respawn", { method: "POST" });
		expect(res.status).toBe(204);
	});
});

describe("POST /api/agents/:id/delete", () => {
	test("returns 204", async () => {
		const app = makeAgentsTestApp({ rosterJson: rosterFixture, stateByShortId: {} });
		const res = await app.request("/api/agents/abcd0001/delete", { method: "POST" });
		expect(res.status).toBe(204);
	});
});
