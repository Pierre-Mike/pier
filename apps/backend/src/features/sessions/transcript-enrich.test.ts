/**
 * Unit tests for transcript-enrich.ts (spec 054).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SnapshotEntry } from "./snapshot.ts";
import {
	encodeClaudeProjectName,
	enrichEntries,
	enrichEntry,
	findRecentTranscript,
	guessCwdFromSessionName,
} from "./transcript-enrich.ts";

const NOW = new Date("2026-05-12T22:00:00.000Z");

const makeEntry = (overrides: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
	name: "pier",
	paneId: null,
	tabTitle: null,
	cwd: "",
	transcriptPath: null,
	claudeResumeId: null,
	lastPrompt: null,
	status: "active",
	updatedAt: NOW,
	...overrides,
});

const touch = (path: string, mtimeSec: number): void => {
	writeFileSync(path, "");
	utimesSync(path, mtimeSec, mtimeSec);
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("encodeClaudeProjectName", () => {
	it("replaces every / with -", () => {
		expect(encodeClaudeProjectName("/Users/x/Github/foo")).toBe("-Users-x-Github-foo");
	});

	it("preserves literal dashes in path components", () => {
		expect(encodeClaudeProjectName("/Users/x/Github/agentic-research")).toBe(
			"-Users-x-Github-agentic-research",
		);
	});
});

describe("guessCwdFromSessionName", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pier-enrich-home-"));
		mkdirSync(join(home, "Github"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("returns ~/Github/<name> when the dir exists", () => {
		mkdirSync(join(home, "Github", "pier"));
		expect(guessCwdFromSessionName("pier", { home })).toBe(join(home, "Github", "pier"));
	});

	it("returns null when the dir does not exist", () => {
		expect(guessCwdFromSessionName("nonexistent", { home })).toBe(null);
	});
});

// ---------------------------------------------------------------------------
// findRecentTranscript
// ---------------------------------------------------------------------------

describe("findRecentTranscript", () => {
	let projectsRoot: string;
	const encoded = "-tmp-fake-cwd";
	const dir = (): string => join(projectsRoot, encoded);
	const NOW_SEC = 1_715_000_000;
	const NOW_MS = NOW_SEC * 1000;

	beforeEach(() => {
		projectsRoot = mkdtempSync(join(tmpdir(), "pier-enrich-projects-"));
		mkdirSync(dir(), { recursive: true });
	});
	afterEach(() => {
		rmSync(projectsRoot, { recursive: true, force: true });
	});

	it("returns the newest *.jsonl within the recency window", async () => {
		touch(join(dir(), "old-session.jsonl"), NOW_SEC - 7200);
		touch(join(dir(), "newer-session.jsonl"), NOW_SEC - 600);
		touch(join(dir(), "newest-session.jsonl"), NOW_SEC - 60);

		const hit = await findRecentTranscript({
			projectsRoot,
			encodedCwd: encoded,
			recencyMs: 60 * 60 * 1000,
			now: NOW_MS,
		});
		expect(hit?.sessionId).toBe("newest-session");
		expect(hit?.otherRecent).toBe(1); // newer-session is also within 60 min
	});

	it("returns null when every transcript is older than recencyMs", async () => {
		touch(join(dir(), "stale.jsonl"), NOW_SEC - 7200);
		const hit = await findRecentTranscript({
			projectsRoot,
			encodedCwd: encoded,
			recencyMs: 60 * 60 * 1000,
			now: NOW_MS,
		});
		expect(hit).toBe(null);
	});

	it("returns null when the project dir is missing", async () => {
		const hit = await findRecentTranscript({
			projectsRoot,
			encodedCwd: "-no-such-dir",
			recencyMs: 60 * 60 * 1000,
			now: NOW_MS,
		});
		expect(hit).toBe(null);
	});

	it("ignores non-jsonl files", async () => {
		touch(join(dir(), "session.jsonl"), NOW_SEC - 60);
		touch(join(dir(), "session.txt"), NOW_SEC - 30);
		writeFileSync(join(dir(), "memory.json"), "{}");
		const hit = await findRecentTranscript({
			projectsRoot,
			encodedCwd: encoded,
			recencyMs: 60 * 60 * 1000,
			now: NOW_MS,
		});
		expect(hit?.sessionId).toBe("session");
	});
});

// ---------------------------------------------------------------------------
// enrichEntry
// ---------------------------------------------------------------------------

describe("enrichEntry", () => {
	let home: string;
	let projectsRoot: string;
	const NOW_MS = 1_715_000_000_000;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pier-enrich-home-"));
		mkdirSync(join(home, "Github", "pier"), { recursive: true });
		projectsRoot = mkdtempSync(join(tmpdir(), "pier-enrich-projects-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		rmSync(projectsRoot, { recursive: true, force: true });
	});

	it("backfills cwd + resume + transcript when discovery left them empty", async () => {
		const encoded = encodeClaudeProjectName(join(home, "Github", "pier"));
		mkdirSync(join(projectsRoot, encoded), { recursive: true });
		const sessionId = "abc-123";
		touch(join(projectsRoot, encoded, `${sessionId}.jsonl`), NOW_MS / 1000 - 60);

		const out = await enrichEntry(makeEntry({ name: "pier" }), {
			home,
			projectsRoot,
			now: () => NOW_MS,
		});
		expect(out.cwd).toBe(join(home, "Github", "pier"));
		expect(out.claudeResumeId).toBe(sessionId);
		expect(out.transcriptPath).toBe(join(projectsRoot, encoded, `${sessionId}.jsonl`));
	});

	it("leaves entries alone when no project dir matches (e.g. default, web_server_bus)", async () => {
		const out = await enrichEntry(makeEntry({ name: "default" }), {
			home,
			projectsRoot,
			now: () => NOW_MS,
		});
		expect(out.cwd).toBe("");
		expect(out.claudeResumeId).toBe(null);
	});

	it("does not overwrite hook-captured cwd / resume", async () => {
		const encoded = encodeClaudeProjectName(join(home, "Github", "pier"));
		mkdirSync(join(projectsRoot, encoded), { recursive: true });
		touch(join(projectsRoot, encoded, "transcript-from-disk.jsonl"), NOW_MS / 1000 - 60);

		const out = await enrichEntry(
			makeEntry({
				name: "pier",
				cwd: "/Users/x/hook-cwd",
				claudeResumeId: "hook-resume",
			}),
			{ home, projectsRoot, now: () => NOW_MS },
		);
		expect(out.cwd).toBe("/Users/x/hook-cwd");
		expect(out.claudeResumeId).toBe("hook-resume");
	});

	it("treats stale transcripts (> recencyMs) as no match", async () => {
		const encoded = encodeClaudeProjectName(join(home, "Github", "pier"));
		mkdirSync(join(projectsRoot, encoded), { recursive: true });
		touch(join(projectsRoot, encoded, "stale.jsonl"), NOW_MS / 1000 - 7200);

		const out = await enrichEntry(makeEntry({ name: "pier" }), {
			home,
			projectsRoot,
			recencyMs: 60 * 60 * 1000,
			now: () => NOW_MS,
		});
		expect(out.claudeResumeId).toBe(null);
	});
});

// ---------------------------------------------------------------------------
// enrichEntries
// ---------------------------------------------------------------------------

describe("enrichEntries", () => {
	it("processes every entry sequentially, preserving order", async () => {
		const home = mkdtempSync(join(tmpdir(), "pier-enrich-home-"));
		const projectsRoot = mkdtempSync(join(tmpdir(), "pier-enrich-projects-"));
		try {
			mkdirSync(join(home, "Github", "pier"), { recursive: true });
			const encoded = encodeClaudeProjectName(join(home, "Github", "pier"));
			mkdirSync(join(projectsRoot, encoded), { recursive: true });
			const NOW_MS = 1_715_000_000_000;
			touch(join(projectsRoot, encoded, "id-pier.jsonl"), NOW_MS / 1000 - 60);

			const out = await enrichEntries(
				[makeEntry({ name: "default" }), makeEntry({ name: "pier" })],
				{ home, projectsRoot, now: () => NOW_MS },
			);
			expect(out[0]?.name).toBe("default");
			expect(out[0]?.claudeResumeId).toBe(null);
			expect(out[1]?.name).toBe("pier");
			expect(out[1]?.claudeResumeId).toBe("id-pier");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(projectsRoot, { recursive: true, force: true });
		}
	});
});
