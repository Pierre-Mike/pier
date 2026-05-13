/**
 * Integration gate for spec 058: live roster drift check + route error-tag contract.
 *
 * Tests:
 *   (a) Live-environment drift: loads ~/.claude/daemon/roster.json if present.
 *       Asserts decodeRoster succeeds. Skipped if file absent.
 *   (b) Route 409 contract: absent roster → 409 { error: "daemon not running" }.
 *   (c) Route 502 contract: present roster but decode fails → 502
 *       { error: "roster shape unrecognized — check CLI version", details: <string> }.
 *   (d) Route 200 contract: valid roster → 200 AgentRow[].
 *
 * RED state:
 *   - (a) fails: WorkerEntrySchema.dispatch is Schema.String, real roster has object.
 *   - (b) passes trivially (409 already returned for absent roster).
 *   - (c) fails: decode-Left is folded into DaemonAbsent → 409, not 502.
 *   - (d) passes (existing behavior once schema is fixed).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeAgentsTestApp } from "./agents.routes.ts";
import { decodeRoster } from "./agents.schema.ts";

const ROSTER_PATH = join(homedir(), ".claude", "daemon", "roster.json");
const rosterExists = existsSync(ROSTER_PATH);

// ---------------------------------------------------------------------------
// (a) Live roster drift check
// ---------------------------------------------------------------------------

describe("agents.schema — live roster drift check", () => {
	test.skipIf(!rosterExists)("decodeRoster accepts the real ~/.claude/daemon/roster.json", () => {
		const raw = JSON.parse(readFileSync(ROSTER_PATH, "utf-8")) as unknown;
		const result = decodeRoster(raw);
		expect(result._tag).toBe("Right");
	});
});

// ---------------------------------------------------------------------------
// (b) Route 409 contract: roster absent
// ---------------------------------------------------------------------------

describe("GET /api/agents — roster absent", () => {
	test('returns 409 { error: "daemon not running" } when roster is null', async () => {
		const app = makeAgentsTestApp({
			rosterJson: null,
			stateByShortId: {},
		});
		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("daemon not running");
	});
});

// ---------------------------------------------------------------------------
// (c) Route 502 contract: roster present but decode fails
// ---------------------------------------------------------------------------

describe("GET /api/agents — roster present but decode fails", () => {
	test('returns 502 { error: "roster shape unrecognized — check CLI version", details: string } when roster has malformed workers', async () => {
		// Roster is present (non-null) but workers contain pid as string → decode fails
		const malformedRoster = {
			workers: {
				abc00001: {
					pid: "not-a-number", // pid must be number per schema
					sessionId: "abc-session",
					cwd: "/tmp",
					cliVersion: "2.1.140",
				},
			},
		};
		const app = makeAgentsTestApp({
			rosterJson: malformedRoster,
			stateByShortId: {},
		});
		const res = await app.request("/api/agents", { method: "GET" });
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string; details: string };
		expect(body.error).toBe("roster shape unrecognized — check CLI version");
		expect(typeof body.details).toBe("string");
		expect(body.details.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// (d) Route 200 contract: valid roster
// ---------------------------------------------------------------------------

describe("GET /api/agents — valid roster", () => {
	test("returns 200 AgentRow[] when roster decodes successfully", async () => {
		// Use a minimal valid roster that passes the schema
		const validRoster = {
			workers: {
				abcd0001: {
					pid: 99999,
					sessionId: "aaaaaaaa-0000-0000-0000-000000000001",
					cwd: "/Users/pierre-mikel/Github/pier",
					cliVersion: "2.1.140",
					dispatch: {
						proto: 1,
						short: "abcd0001",
						nonce: "deadbeef",
						sessionId: "aaaaaaaa-0000-0000-0000-000000000001",
						createdAt: 1778684794869,
						source: "spare",
						cwd: "/Users/pierre-mikel/Github/pier",
						launch: { mode: "prompt", args: [] },
						env: {},
						isolation: "none",
						respawnFlags: [],
						agent: "claude",
						seed: { intent: "" },
					},
				},
			},
		};
		const app = makeAgentsTestApp({
			rosterJson: validRoster,
			stateByShortId: {},
		});
		const res = await app.request("/api/agents", { method: "GET" });
		// 200 with empty array (no state files → no rows) is acceptable
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});
});
