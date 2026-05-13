/**
 * Unit gate for spec 058: agents schema decoder correctness.
 *
 * Pure unit tests — no filesystem access. Tests:
 *   (a) Fixture regression: roster.fixture.json must round-trip through decodeRoster.
 *   (b) Strict-field assertions: decoded workers have correct types for consumed fields.
 *   (c) Decode failure: decodeRoster returns Left for invalid inputs.
 *
 * RED state: (a) fails because WorkerEntrySchema.dispatch is Schema.String
 * but roster.fixture.json (once updated) has dispatch as a nested object.
 * Until the fixture is also updated, the test will fail with a type mismatch.
 */

import { describe, expect, test } from "bun:test";
import fixtureJson from "./__fixtures__/roster.fixture.json";
import { decodeRoster } from "./agents.schema.ts";

// ---------------------------------------------------------------------------
// (a) Fixture regression check
// ---------------------------------------------------------------------------

describe("agents.schema — fixture regression", () => {
	test("decodeRoster accepts roster.fixture.json", () => {
		const result = decodeRoster(fixtureJson);
		expect(result._tag).toBe("Right");
	});

	test("fixture workers have expected strict fields", () => {
		const result = decodeRoster(fixtureJson);
		expect(result._tag).toBe("Right");
		if (result._tag !== "Right") return;

		const workers = Object.values(result.right.workers);
		expect(workers.length).toBeGreaterThan(0);

		for (const worker of workers) {
			expect(typeof worker.pid).toBe("number");
			expect(typeof worker.sessionId).toBe("string");
			expect(typeof worker.cwd).toBe("string");
			expect(typeof worker.cliVersion).toBe("string");
		}
	});
});

// ---------------------------------------------------------------------------
// (b) Decode failure checks
// ---------------------------------------------------------------------------

describe("agents.schema — decode failure produces Left", () => {
	test("decodeRoster returns Left for completely invalid input", () => {
		const result = decodeRoster({ workers: { abc: { pid: "not-a-number" } } });
		expect(result._tag).toBe("Left");
	});

	test("decodeRoster returns Left when workers map is missing", () => {
		const result = decodeRoster({});
		expect(result._tag).toBe("Left");
	});

	test("decodeRoster returns Left when input is null", () => {
		const result = decodeRoster(null);
		expect(result._tag).toBe("Left");
	});
});
