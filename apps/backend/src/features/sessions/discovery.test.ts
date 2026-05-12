/**
 * Unit tests for discovery.ts (spec 048).
 *
 * Pure parsers are tested against captured fixture strings from real
 * `zellij action ...` invocations. The Spawner abstraction lets us drive
 * inspectSession / discoverSnapshotEntries without touching a live zellij.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	discoverSnapshotEntries,
	enumerateZellijSessions,
	inspectSession,
	isOrphanedSessionOutput,
	parseListClients,
	parseListPanes,
	parseListTabs,
	type Spawner,
	type SpawnResult,
} from "./discovery.ts";

describe("isOrphanedSessionOutput", () => {
	it("matches zellij's 'Session not found' header", () => {
		const out = `Session 'web_server_bus' not found. The following sessions are active:\nfoo\nbar\n`;
		expect(isOrphanedSessionOutput(out)).toBe(true);
	});
	it("does not match a real list-tabs payload", () => {
		expect(isOrphanedSessionOutput("TAB_ID  POSITION  NAME\n0  0  foo\n")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Pure parsers
// ---------------------------------------------------------------------------

describe("parseListTabs", () => {
	it("parses the standard header + one row", () => {
		const out = `TAB_ID  POSITION  NAME
0  0  Language choice impact on AI response quality
`;
		const tabs = parseListTabs(out);
		expect(tabs).toHaveLength(1);
		expect(tabs[0]?.id).toBe("0");
		expect(tabs[0]?.position).toBe(0);
		expect(tabs[0]?.name).toBe("Language choice impact on AI response quality");
	});

	it("parses multiple rows and preserves spaces in name", () => {
		const out = `TAB_ID  POSITION  NAME
0  0  alpha
1  1  beta with several   spaces
`;
		const tabs = parseListTabs(out);
		expect(tabs).toHaveLength(2);
		expect(tabs[1]?.name).toBe("beta with several   spaces");
	});

	it("returns empty array on empty input", () => {
		expect(parseListTabs("")).toEqual([]);
	});

	it("ignores blank lines", () => {
		const out = `TAB_ID  POSITION  NAME

0  0  alpha

`;
		expect(parseListTabs(out)).toHaveLength(1);
	});
});

describe("parseListPanes", () => {
	it("parses the header + one row", () => {
		const out = `PANE_ID  TYPE  TITLE
terminal_0  terminal  pierre-mikel@LOGIC-1335
`;
		const panes = parseListPanes(out);
		expect(panes).toHaveLength(1);
		expect(panes[0]?.id).toBe("terminal_0");
		expect(panes[0]?.type).toBe("terminal");
		expect(panes[0]?.title).toBe("pierre-mikel@LOGIC-1335");
	});

	it("parses plugin panes alongside terminal panes", () => {
		const out = `PANE_ID  TYPE  TITLE
plugin_2  plugin  zellij:tab-bar
terminal_0  terminal  bash
`;
		const panes = parseListPanes(out);
		expect(panes.map((p) => p.type)).toEqual(["plugin", "terminal"]);
	});
});

describe("parseListClients", () => {
	it("parses the header + one row with N/A command", () => {
		const out = `CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND
3         terminal_0     N/A
`;
		const clients = parseListClients(out);
		expect(clients).toHaveLength(1);
		expect(clients[0]?.clientId).toBe("3");
		expect(clients[0]?.paneId).toBe("terminal_0");
		expect(clients[0]?.runningCommand).toBe("N/A");
	});

	it("captures multi-word running commands", () => {
		const out = `CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND
1  terminal_0  claude --resume sess_abc123
`;
		const clients = parseListClients(out);
		expect(clients[0]?.runningCommand).toBe("claude --resume sess_abc123");
	});
});

// ---------------------------------------------------------------------------
// enumerateZellijSessions
// ---------------------------------------------------------------------------

describe("enumerateZellijSessions", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "pier-discovery-"));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("returns names of files under <root>/contract_version_1", async () => {
		const sockDir = join(tmp, "contract_version_1");
		mkdirSync(sockDir, { recursive: true });
		writeFileSync(join(sockDir, "default"), "");
		writeFileSync(join(sockDir, "pier"), "");
		const names = await enumerateZellijSessions(tmp);
		expect([...names].sort()).toEqual(["default", "pier"]);
	});

	it("skips dotfiles", async () => {
		const sockDir = join(tmp, "contract_version_1");
		mkdirSync(sockDir, { recursive: true });
		writeFileSync(join(sockDir, ".DS_Store"), "");
		writeFileSync(join(sockDir, "real"), "");
		expect(await enumerateZellijSessions(tmp)).toEqual(["real"]);
	});

	it("returns [] when socket dir is missing", async () => {
		expect(await enumerateZellijSessions(tmp)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// inspectSession + discoverSnapshotEntries with mock spawner
// ---------------------------------------------------------------------------

const okSpawn = (stdout: string): SpawnResult => ({ stdout, stderr: "", exitCode: 0 });
const failSpawn = (): SpawnResult => ({ stdout: "", stderr: "", exitCode: 1 });
const orphanSpawn = (session: string): SpawnResult => ({
	stdout: "default [Created 5h ago]\n",
	stderr: `Session '${session}' not found. The following sessions are active:\n`,
	exitCode: 0,
});

describe("inspectSession", () => {
	it("calls list-tabs / list-panes / list-clients with the session name", async () => {
		const calls: string[][] = [];
		const spawner: Spawner = async (cmd) => {
			calls.push([...cmd]);
			if (cmd.includes("list-tabs")) return okSpawn("TAB_ID  POSITION  NAME\n0  0  my-tab\n");
			if (cmd.includes("list-panes"))
				return okSpawn("PANE_ID  TYPE  TITLE\nterminal_0  terminal  bash\n");
			if (cmd.includes("list-clients"))
				return okSpawn("CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND\n1  terminal_0  bash\n");
			return failSpawn();
		};
		const result = await inspectSession("alpha", { zellijRoot: "/tmp/z", spawner });
		expect(result.tabs[0]?.name).toBe("my-tab");
		expect(result.panes[0]?.title).toBe("bash");
		expect(result.clients[0]?.runningCommand).toBe("bash");
		expect(calls).toHaveLength(3);
		for (const c of calls) {
			expect(c).toContain("alpha");
		}
	});

	it("returns empty arrays for each failed sub-call", async () => {
		const spawner: Spawner = async () => failSpawn();
		const result = await inspectSession("alpha", { zellijRoot: "/tmp/z", spawner });
		expect(result.tabs).toEqual([]);
		expect(result.panes).toEqual([]);
		expect(result.clients).toEqual([]);
	});
});

describe("discoverSnapshotEntries", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "pier-discovery-"));
		const sockDir = join(tmp, "contract_version_1");
		mkdirSync(sockDir, { recursive: true });
		writeFileSync(join(sockDir, "default"), "");
		writeFileSync(join(sockDir, "pier"), "");
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("returns one SnapshotEntry per session with tab/command captured", async () => {
		const now = new Date("2026-05-12T20:00:00.000Z");
		const spawner: Spawner = async (cmd) => {
			const session = cmd[2];
			if (cmd.includes("list-tabs"))
				return okSpawn(`TAB_ID  POSITION  NAME\n0  0  tab-${session}\n`);
			if (cmd.includes("list-panes"))
				return okSpawn(`PANE_ID  TYPE  TITLE\nterminal_0  terminal  shell\n`);
			if (cmd.includes("list-clients"))
				return okSpawn(`CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND\n1  terminal_0  cmd-${session}\n`);
			return failSpawn();
		};

		const entries = await discoverSnapshotEntries({ zellijRoot: tmp, spawner, now: () => now });
		expect(entries).toHaveLength(2);
		const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
		expect(byName["default"]?.tabTitle).toBe("tab-default");
		expect(byName["default"]?.lastPrompt).toBe("cmd-default");
		expect(byName["default"]?.status).toBe("active");
		expect(byName["default"]?.updatedAt).toEqual(now);
		expect(byName["pier"]?.tabTitle).toBe("tab-pier");
	});

	it("treats 'N/A' running command as null lastPrompt", async () => {
		const spawner: Spawner = async (cmd) => {
			if (cmd.includes("list-tabs")) return okSpawn(`TAB_ID  POSITION  NAME\n0  0  t\n`);
			if (cmd.includes("list-panes"))
				return okSpawn(`PANE_ID  TYPE  TITLE\nterminal_0  terminal  s\n`);
			if (cmd.includes("list-clients"))
				return okSpawn(`CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND\n1  terminal_0  N/A\n`);
			return failSpawn();
		};
		const entries = await discoverSnapshotEntries({ zellijRoot: tmp, spawner });
		expect(entries[0]?.lastPrompt).toBe(null);
	});

	it("marks orphaned sockets (stderr 'Session not found') as status=crashed", async () => {
		const spawner: Spawner = async (cmd) => orphanSpawn(cmd[2] ?? "");
		const entries = await discoverSnapshotEntries({ zellijRoot: tmp, spawner });
		expect(entries.every((e) => e.status === "crashed")).toBe(true);
		expect(entries.every((e) => e.tabTitle === null)).toBe(true);
		expect(entries.every((e) => e.lastPrompt === null)).toBe(true);
	});

	it("returns [] when socket dir is empty", async () => {
		rmSync(join(tmp, "contract_version_1"), { recursive: true });
		mkdirSync(join(tmp, "contract_version_1"));
		const spawner: Spawner = async () => failSpawn();
		expect(await discoverSnapshotEntries({ zellijRoot: tmp, spawner })).toEqual([]);
	});
});
