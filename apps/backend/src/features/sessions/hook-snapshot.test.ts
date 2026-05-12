/**
 * Unit tests for hook-snapshot.ts (spec 049).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildEntryFromHook,
	deriveZellijSessionName,
	type HookPayload,
	persistHookSnapshot,
	statusForEvent,
} from "./hook-snapshot.ts";

const NOW = new Date("2026-05-12T20:30:00.000Z");

const basePayload: HookPayload = {
	hook_event_name: "Stop",
	session_id: "sess_abc123def456",
	transcript_path: "/Users/x/.claude/projects/foo/sess_abc123def456.jsonl",
	cwd: "/Users/x/Github/foo",
};

describe("deriveZellijSessionName", () => {
	it("returns ZELLIJ_SESSION_NAME when present", () => {
		expect(deriveZellijSessionName(basePayload, { ZELLIJ_SESSION_NAME: "pier" })).toBe("pier");
	});

	it("falls back to claude-<sessionId-12> when env var missing", () => {
		expect(deriveZellijSessionName(basePayload, {})).toBe("claude-sess_abc123d");
	});

	it("returns 'unknown' when neither env nor session_id are usable", () => {
		expect(deriveZellijSessionName({ hook_event_name: "Stop" }, {})).toBe("unknown");
	});

	it("ignores empty ZELLIJ_SESSION_NAME and falls through", () => {
		expect(deriveZellijSessionName(basePayload, { ZELLIJ_SESSION_NAME: "" })).toBe(
			"claude-sess_abc123d",
		);
	});
});

describe("statusForEvent", () => {
	it("Stop → active", () => {
		expect(statusForEvent("Stop")).toBe("active");
	});
	it("Notification → active", () => {
		expect(statusForEvent("Notification")).toBe("active");
	});
	it("anything else → unknown", () => {
		expect(statusForEvent("Whatever")).toBe("unknown");
	});
});

describe("buildEntryFromHook", () => {
	it("populates all fields from a complete Stop payload", () => {
		const entry = buildEntryFromHook({
			payload: basePayload,
			env: { ZELLIJ_SESSION_NAME: "pier" },
			now: NOW,
		});
		expect(entry.name).toBe("pier");
		expect(entry.cwd).toBe("/Users/x/Github/foo");
		expect(entry.transcriptPath).toBe("/Users/x/.claude/projects/foo/sess_abc123def456.jsonl");
		expect(entry.claudeResumeId).toBe("sess_abc123def456");
		expect(entry.status).toBe("active");
		expect(entry.lastPrompt).toBe(null);
		expect(entry.updatedAt).toEqual(NOW);
	});

	it("captures Notification message as lastPrompt", () => {
		const entry = buildEntryFromHook({
			payload: { ...basePayload, hook_event_name: "Notification", message: "Permission needed" },
			env: { ZELLIJ_SESSION_NAME: "pier" },
			now: NOW,
		});
		expect(entry.lastPrompt).toBe("Permission needed");
		expect(entry.status).toBe("active");
	});

	it("leaves cwd='' and transcriptPath/null when payload omits them", () => {
		const entry = buildEntryFromHook({
			payload: { hook_event_name: "Stop" },
			env: { ZELLIJ_SESSION_NAME: "pier" },
			now: NOW,
		});
		expect(entry.cwd).toBe("");
		expect(entry.transcriptPath).toBe(null);
		expect(entry.claudeResumeId).toBe(null);
	});
});

describe("persistHookSnapshot", () => {
	let dataDir: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "pier-hook-snapshot-"));
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("writes registry.json with the derived entry", async () => {
		const result = await persistHookSnapshot({
			payload: basePayload,
			env: { ZELLIJ_SESSION_NAME: "pier" },
			dataDir,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		const raw = await Bun.file(join(dataDir, "registry.json")).text();
		const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
		expect(parsed["pier"]?.["claudeResumeId"]).toBe("sess_abc123def456");
		expect(parsed["pier"]?.["transcriptPath"]).toBe(
			"/Users/x/.claude/projects/foo/sess_abc123def456.jsonl",
		);
	});

	it("appends to history.ndjson on every call", async () => {
		await persistHookSnapshot({
			payload: basePayload,
			env: { ZELLIJ_SESSION_NAME: "pier" },
			dataDir,
			now: NOW,
		});
		await persistHookSnapshot({
			payload: { ...basePayload, hook_event_name: "Notification", message: "x" },
			env: { ZELLIJ_SESSION_NAME: "pier" },
			dataDir,
			now: NOW,
		});
		const raw = await Bun.file(join(dataDir, "history.ndjson")).text();
		expect(raw.trim().split("\n").filter(Boolean)).toHaveLength(2);
	});

	it("returns ok:false when dataDir is unwritable", async () => {
		const result = await persistHookSnapshot({
			payload: basePayload,
			env: { ZELLIJ_SESSION_NAME: "pier" },
			dataDir: "/dev/null/cannot-write-here",
			now: NOW,
		});
		expect(result.ok).toBe(false);
	});
});
