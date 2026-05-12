/**
 * Unit tests for cli-snapshot.ts (spec 050).
 *
 * Both snapshotNow and executeRestore expose injectable seams (Spawner, persist)
 * so these tests drive real registry I/O on a temp dir but never touch zellij.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	executeRestore,
	listSnapshots,
	planRestore,
	type SpawnOnly,
	snapshotNow,
} from "./cli-snapshot.ts";
import type { Spawner } from "./discovery.ts";
import type { SnapshotEntry } from "./snapshot.ts";

const NOW = new Date("2026-05-12T22:00:00.000Z");

const makeEntry = (overrides: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
	name: "session-alpha",
	tabTitle: "tab-1",
	cwd: "/Users/x/repo",
	transcriptPath: "/Users/x/.claude/projects/repo/sess.jsonl",
	claudeResumeId: "sess_resume_alpha",
	lastPrompt: null,
	status: "active",
	updatedAt: NOW,
	...overrides,
});

// ---------------------------------------------------------------------------
// snapshotNow
// ---------------------------------------------------------------------------

describe("snapshotNow", () => {
	let dataDir: string;
	let zellijRoot: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "pier-cli-snapshot-"));
		zellijRoot = mkdtempSync(join(tmpdir(), "pier-cli-zellij-"));
		const sockDir = join(zellijRoot, "contract_version_1");
		mkdirSync(sockDir, { recursive: true });
		writeFileSync(join(sockDir, "alpha"), "");
		writeFileSync(join(sockDir, "beta"), "");
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
		rmSync(zellijRoot, { recursive: true, force: true });
	});

	it("persists one entry per discovered session", async () => {
		const spawner: Spawner = async (cmd) => {
			if (cmd.includes("list-tabs"))
				return { stdout: `TAB_ID  POSITION  NAME\n0  0  tab-${cmd[2]}\n`, stderr: "", exitCode: 0 };
			if (cmd.includes("list-panes"))
				return {
					stdout: "PANE_ID  TYPE  TITLE\nterminal_0  terminal  shell\n",
					stderr: "",
					exitCode: 0,
				};
			if (cmd.includes("list-clients"))
				return {
					stdout: "CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND\n1  terminal_0  bash\n",
					stderr: "",
					exitCode: 0,
				};
			return { stdout: "", stderr: "", exitCode: 1 };
		};
		const entries = await snapshotNow({ dataDir, zellijRoot, spawner, now: () => NOW });
		expect(entries).toHaveLength(2);

		const raw = await Bun.file(join(dataDir, "registry.json")).text();
		const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
		expect(Object.keys(parsed).sort()).toEqual(["alpha", "beta"]);
		expect(parsed["alpha"]?.["tabTitle"]).toBe("tab-alpha");
	});
});

// ---------------------------------------------------------------------------
// planRestore + executeRestore
// ---------------------------------------------------------------------------

describe("planRestore", () => {
	let dataDir: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "pier-cli-restore-"));
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("returns not-found when registry is missing", async () => {
		const plan = await planRestore({ dataDir, sessionName: "anything" });
		expect(plan.kind).toBe("not-found");
	});

	it("returns spawn-session with the matched entry", async () => {
		const { snapshotSession } = await import("./snapshot.ts");
		await snapshotSession(dataDir, makeEntry({ name: "alpha" }));
		const plan = await planRestore({ dataDir, sessionName: "alpha" });
		expect(plan.kind).toBe("spawn-session");
		if (plan.kind !== "spawn-session") return;
		expect(plan.entry.name).toBe("alpha");
		expect(plan.claudeResume).toBe("sess_resume_alpha");
	});
});

describe("executeRestore", () => {
	let dataDir: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "pier-cli-restore-exec-"));
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("spawns the session then injects claude --resume", async () => {
		const { snapshotSession } = await import("./snapshot.ts");
		await snapshotSession(dataDir, makeEntry({ name: "alpha" }));
		const calls: string[][] = [];
		const spawn: SpawnOnly = async (cmd) => {
			calls.push([...cmd]);
			return { exitCode: 0 };
		};
		const plan = await executeRestore({ dataDir, sessionName: "alpha", spawn });
		expect(plan.kind).toBe("spawn-session");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain("alpha");
		expect(calls[1]?.some((s) => s.includes("claude --resume sess_resume_alpha"))).toBe(true);
	});

	it("skips claude inject when claudeResumeId is null", async () => {
		const { snapshotSession } = await import("./snapshot.ts");
		await snapshotSession(dataDir, makeEntry({ name: "alpha", claudeResumeId: null }));
		const calls: string[][] = [];
		// Force the entry to be returned by listResumable: status=crashed+resumeId is filtered
		// out (null id), so this test pre-seeds via writing registry.json directly with status=active.
		const raw = await Bun.file(join(dataDir, "registry.json")).text();
		const obj = JSON.parse(raw) as Record<string, Record<string, unknown>>;
		// listResumable filters out null claudeResumeId — so we expect not-found path below.
		expect(Object.keys(obj)).toContain("alpha");

		const spawn: SpawnOnly = async (cmd) => {
			calls.push([...cmd]);
			return { exitCode: 0 };
		};
		const plan = await executeRestore({ dataDir, sessionName: "alpha", spawn });
		// Entries with null claudeResumeId are not resumable → not-found.
		expect(plan.kind).toBe("not-found");
		expect(calls).toHaveLength(0);
	});

	it("returns not-found and does NOT spawn when session is missing", async () => {
		const calls: string[][] = [];
		const spawn: SpawnOnly = async (cmd) => {
			calls.push([...cmd]);
			return { exitCode: 0 };
		};
		const plan = await executeRestore({ dataDir, sessionName: "ghost", spawn });
		expect(plan.kind).toBe("not-found");
		expect(calls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// listSnapshots
// ---------------------------------------------------------------------------

describe("listSnapshots", () => {
	let dataDir: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "pier-cli-list-"));
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("returns one line per resumable entry", async () => {
		const { snapshotSession } = await import("./snapshot.ts");
		await snapshotSession(dataDir, makeEntry({ name: "alpha" }));
		await snapshotSession(dataDir, makeEntry({ name: "beta", status: "crashed" }));
		await snapshotSession(dataDir, makeEntry({ name: "gamma", status: "unknown" }));

		const { entries, lines } = await listSnapshots(dataDir);
		const names = entries.map((e) => e.name).sort();
		expect(names).toEqual(["alpha", "beta"]);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/alpha/);
	});

	it("returns empty arrays when registry is missing", async () => {
		const { entries, lines } = await listSnapshots(dataDir);
		expect(entries).toEqual([]);
		expect(lines).toEqual([]);
	});

	it("with all:true returns every entry including unknown/null-resume", async () => {
		const { snapshotSession } = await import("./snapshot.ts");
		await snapshotSession(dataDir, makeEntry({ name: "alpha" }));
		await snapshotSession(dataDir, makeEntry({ name: "beta", status: "unknown" }));
		await snapshotSession(dataDir, makeEntry({ name: "gamma", claudeResumeId: null }));

		const { entries } = await listSnapshots(dataDir, { all: true });
		expect(entries.map((e) => e.name).sort()).toEqual(["alpha", "beta", "gamma"]);
	});
});
