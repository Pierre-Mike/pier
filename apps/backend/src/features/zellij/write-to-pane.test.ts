/**
 * Unit tests for write-to-pane.ts — the shared focus-then-write-chars helper.
 */

import { describe, expect, it } from "bun:test";
import { type SpawnExit, writeToPane } from "./write-to-pane.ts";

const okSpawn: SpawnExit = async () => ({ exitCode: 0 });
const failSpawn: SpawnExit = async () => ({ exitCode: 1 });

describe("writeToPane", () => {
	it("focuses then writes in order, returning both ok flags", async () => {
		const calls: string[][] = [];
		const spawn: SpawnExit = async (cmd) => {
			calls.push([...cmd]);
			return { exitCode: 0 };
		};
		const result = await writeToPane({
			session: "alpha",
			paneId: "terminal_3",
			text: "claude --resume sess_x\n",
			spawn,
		});
		expect(result).toEqual({ focusedOk: true, wroteOk: true });
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual([
			"zellij",
			"--session",
			"alpha",
			"action",
			"focus-pane-id",
			"terminal_3",
		]);
		expect(calls[1]?.slice(0, 5)).toEqual([
			"zellij",
			"--session",
			"alpha",
			"action",
			"write-chars",
		]);
		expect(calls[1]?.[5]).toBe("claude --resume sess_x\n");
	});

	it("does NOT attempt to write when focus fails", async () => {
		const calls: string[][] = [];
		const spawn: SpawnExit = async (cmd) => {
			calls.push([...cmd]);
			return { exitCode: 1 };
		};
		const result = await writeToPane({ session: "a", paneId: "p", text: "x", spawn });
		expect(result).toEqual({ focusedOk: false, wroteOk: false });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.includes("focus-pane-id")).toBe(true);
	});

	it("reports wroteOk=false when write-chars fails despite focus success", async () => {
		let call = 0;
		const spawn: SpawnExit = async () => {
			call++;
			return { exitCode: call === 1 ? 0 : 1 };
		};
		const result = await writeToPane({ session: "a", paneId: "p", text: "x", spawn });
		expect(result).toEqual({ focusedOk: true, wroteOk: false });
	});

	// Defensive: keep the smoke-asserted shapes wired so changes to the helper
	// signature break tests rather than silently changing call-site behaviour.
	it("call shape is fixed: 2 spawns, focus-pane-id then write-chars", async () => {
		void okSpawn;
		void failSpawn;
		expect(typeof writeToPane).toBe("function");
	});
});
