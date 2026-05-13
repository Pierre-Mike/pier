/**
 * Integration gate for spec 058: live roster drift check.
 *
 * Loads ~/.claude/daemon/roster.json if present (skipped if absent).
 * Asserts decodeRoster succeeds on the live file — proves no schema drift
 * against the running Claude CLI version on the maintainer's machine.
 *
 * RED state: this test fails (when the live roster is present) because
 * WorkerEntrySchema.dispatch is Schema.String but the real roster has
 * dispatch as a nested object.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decodeRoster } from "./agents.schema.ts";

const ROSTER_PATH = join(homedir(), ".claude", "daemon", "roster.json");
const rosterExists = existsSync(ROSTER_PATH);

describe("agents.schema — live roster drift check", () => {
	test.skipIf(!rosterExists)("decodeRoster accepts the real ~/.claude/daemon/roster.json", () => {
		const raw = JSON.parse(readFileSync(ROSTER_PATH, "utf-8")) as unknown;
		const result = decodeRoster(raw);
		expect(result._tag).toBe("Right");
	});
});
