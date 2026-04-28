import { describe, expect, it } from "bun:test";
import { terminalClipboardHelperScript } from "./terminal-clipboard.ts";

describe("terminal iframe clipboard wiring", () => {
	it("injects a helper that posts selected terminal text to the parent", () => {
		const script = terminalClipboardHelperScript();

		expect(script).toContain("pier:terminal-copy");
		expect(script).toContain("window.parent.postMessage");
		expect(script).toContain("getSelection");
	});
});
