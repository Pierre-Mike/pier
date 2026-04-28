import { describe, expect, test } from "bun:test";

const projectsSource = await Bun.file(new URL("./projects.ts", import.meta.url)).text();
const dashboardFiles = ["./projects.ts", "./terminal-focus.test.ts"] as const;

describe("terminal iframe dashboard wiring", () => {
	test("does not install the broken postMessage clipboard bridge", () => {
		expect(projectsSource).not.toContain("terminal-clipboard");
		expect(projectsSource).not.toContain("installTerminalClipboardHelper");
		expect(projectsSource).not.toContain("wireTerminalClipboardBridge");
	});

	test("terminal dashboard files do not reference the removed bridge message", async () => {
		const contents = await Promise.all(
			dashboardFiles.map((file) => Bun.file(new URL(file, import.meta.url)).text()),
		);

		expect(contents.join("\n")).not.toContain("pier:terminal-copy");
		expect(contents.join("\n")).not.toContain("window.parent.postMessage");
	});
});
