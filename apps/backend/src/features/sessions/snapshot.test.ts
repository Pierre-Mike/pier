/**
 * Gate: spec 047 — Add Zellij session snapshot registry
 *
 * RED: these tests import from snapshot.ts which does not yet exist.
 * GREEN: snapshot.ts is implemented and all assertions pass.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reads via Bun.file deliberately bypass node:fs/promises so this suite
// is unaffected when another test file (e.g. zellij.auth.repo.test.ts)
// registers a process-global mock.module("node:fs/promises", ...).
const readFile = (path: string): Promise<string> => Bun.file(path).text();

import {
	filterResumable,
	listResumable,
	type SnapshotEntry,
	type SnapshotRegistry,
	snapshotSession,
	upsertEntry,
} from "./snapshot.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let dataDir: string;

beforeEach(() => {
	dataDir = mkdtempSync(join(tmpdir(), "pier-snapshot-test-"));
	mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
	rmSync(dataDir, { recursive: true, force: true });
});

const makeEntry = (overrides: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
	name: "session-alpha",
	paneId: null,
	tabTitle: "Claude Code — pier",
	cwd: "/Users/test/pier",
	transcriptPath: "/Users/test/.claude/projects/pier/transcript.jsonl",
	claudeResumeId: "sess_abc123",
	lastPrompt: "Refactor the sessions module",
	status: "active",
	updatedAt: new Date("2026-05-12T00:00:00.000Z"),
	...overrides,
});

// ---------------------------------------------------------------------------
// Core pure functions
// ---------------------------------------------------------------------------

describe("upsertEntry", () => {
	it("inserts a new entry into an empty registry", () => {
		const registry: SnapshotRegistry = {};
		const entry = makeEntry();
		const updated = upsertEntry(registry, entry);
		expect(updated["session-alpha"]).toEqual(entry);
	});

	it("overwrites an existing entry for the same name", () => {
		const entry1 = makeEntry({ lastPrompt: "first" });
		const registry: SnapshotRegistry = { "session-alpha": entry1 };
		const entry2 = makeEntry({ lastPrompt: "second" });
		const updated = upsertEntry(registry, entry2);
		expect(updated["session-alpha"]?.lastPrompt).toBe("second");
	});

	it("leaves other entries intact when upserting", () => {
		const beta = makeEntry({ name: "session-beta" });
		const registry: SnapshotRegistry = { "session-beta": beta };
		const alpha = makeEntry({ name: "session-alpha" });
		const updated = upsertEntry(registry, alpha);
		expect(Object.keys(updated)).toHaveLength(2);
		expect(updated["session-beta"]).toEqual(beta);
	});

	it("does not mutate the input registry", () => {
		const registry: SnapshotRegistry = {};
		const entry = makeEntry();
		upsertEntry(registry, entry);
		expect(Object.keys(registry)).toHaveLength(0);
	});
});

describe("filterResumable", () => {
	it("returns entries with status active or crashed and non-null claudeResumeId", () => {
		const registry: SnapshotRegistry = {
			a: makeEntry({ name: "a", status: "active", claudeResumeId: "id_a" }),
			b: makeEntry({ name: "b", status: "crashed", claudeResumeId: "id_b" }),
			c: makeEntry({ name: "c", status: "unknown", claudeResumeId: "id_c" }),
			d: makeEntry({ name: "d", status: "active", claudeResumeId: null }),
		};
		const resumable = filterResumable(registry);
		const names = resumable.map((e) => e.name).sort();
		expect(names).toEqual(["a", "b"]);
	});

	it("returns empty array when registry is empty", () => {
		expect(filterResumable({})).toEqual([]);
	});

	it("excludes status=unknown even with a claudeResumeId", () => {
		const registry: SnapshotRegistry = {
			x: makeEntry({ name: "x", status: "unknown", claudeResumeId: "id_x" }),
		};
		expect(filterResumable(registry)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Imperative shell — snapshotSession
// ---------------------------------------------------------------------------

describe("snapshotSession", () => {
	it("AC1: writes registry.json with all required fields", async () => {
		const entry = makeEntry();
		await snapshotSession(dataDir, entry);

		const raw = await readFile(join(dataDir, "registry.json"));
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const stored = parsed["session-alpha"] as Record<string, unknown>;

		expect(stored).toBeDefined();
		expect(stored["name"]).toBe("session-alpha");
		expect(stored["tabTitle"]).toBe("Claude Code — pier");
		expect(stored["cwd"]).toBe("/Users/test/pier");
		expect(stored["transcriptPath"]).toBe("/Users/test/.claude/projects/pier/transcript.jsonl");
		expect(stored["claudeResumeId"]).toBe("sess_abc123");
		expect(stored["lastPrompt"]).toBe("Refactor the sessions module");
		expect(stored["status"]).toBe("active");
		expect(stored["updatedAt"]).toBeDefined();
	});

	it("AC2: second call for same name overwrites entry, leaves others intact", async () => {
		const entry1 = makeEntry({ name: "session-alpha", lastPrompt: "first" });
		const entry2 = makeEntry({ name: "session-beta", lastPrompt: "beta" });
		await snapshotSession(dataDir, entry1);
		await snapshotSession(dataDir, entry2);
		await snapshotSession(dataDir, makeEntry({ name: "session-alpha", lastPrompt: "second" }));

		const raw = await readFile(join(dataDir, "registry.json"));
		const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
		expect(parsed["session-alpha"]?.["lastPrompt"]).toBe("second");
		expect(parsed["session-beta"]?.["lastPrompt"]).toBe("beta");
		expect(Object.keys(parsed)).toHaveLength(2);
	});

	it("AC3: each call appends a line to history.ndjson", async () => {
		await snapshotSession(dataDir, makeEntry({ lastPrompt: "call 1" }));
		await snapshotSession(dataDir, makeEntry({ lastPrompt: "call 2" }));
		await snapshotSession(dataDir, makeEntry({ lastPrompt: "call 3" }));

		const raw = await readFile(join(dataDir, "history.ndjson"));
		const lines = raw.trim().split("\n").filter(Boolean);
		expect(lines).toHaveLength(3);
		for (const line of lines) {
			const obj = JSON.parse(line) as Record<string, unknown>;
			expect(obj["name"]).toBe("session-alpha");
			expect(obj["ts"]).toBeDefined();
		}
	});

	it("AC6: registry.json is valid JSON", async () => {
		await snapshotSession(dataDir, makeEntry());
		const raw = await readFile(join(dataDir, "registry.json"));
		expect(() => JSON.parse(raw)).not.toThrow();
	});

	it("atomicity: tmp file is absent after successful write", async () => {
		await snapshotSession(dataDir, makeEntry());
		const { existsSync } = await import("node:fs");
		expect(existsSync(join(dataDir, "registry.json.tmp"))).toBe(false);
		expect(existsSync(join(dataDir, "registry.json"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Imperative shell — listResumable
// ---------------------------------------------------------------------------

describe("listResumable", () => {
	it("AC4: returns only active/crashed sessions with non-null claudeResumeId", async () => {
		await snapshotSession(
			dataDir,
			makeEntry({ name: "s1", status: "active", claudeResumeId: "id1" }),
		);
		await snapshotSession(
			dataDir,
			makeEntry({ name: "s2", status: "crashed", claudeResumeId: "id2" }),
		);
		await snapshotSession(
			dataDir,
			makeEntry({ name: "s3", status: "unknown", claudeResumeId: "id3" }),
		);
		await snapshotSession(
			dataDir,
			makeEntry({ name: "s4", status: "active", claudeResumeId: null }),
		);

		const resumable = await listResumable(dataDir);
		const names = resumable.map((e) => e.name).sort();
		expect(names).toEqual(["s1", "s2"]);
	});

	it("AC5: returns empty array when registry file does not exist", async () => {
		const result = await listResumable(dataDir);
		expect(result).toEqual([]);
	});

	it("AC5: returns empty array when registry is empty object", async () => {
		// Write an empty registry manually — Bun.write bypasses the global mock.
		await Bun.write(join(dataDir, "registry.json"), "{}");
		expect(await listResumable(dataDir)).toEqual([]);
	});
});
