import { describe, expect, it } from "bun:test";
import { isTerminalCopyMessage } from "../dashboard/terminal-clipboard.ts";

describe("terminal clipboard copy messages", () => {
	it("accepts valid terminal copy messages with selected text", () => {
		expect(isTerminalCopyMessage({ type: "pier:terminal-copy", text: "session-id" })).toBe(true);
	});

	it("rejects empty, malformed, or unrelated messages", () => {
		expect(isTerminalCopyMessage({ type: "pier:terminal-copy", text: "" })).toBe(false);
		expect(isTerminalCopyMessage({ type: "other", text: "session-id" })).toBe(false);
		expect(isTerminalCopyMessage("session-id")).toBe(false);
	});
});
