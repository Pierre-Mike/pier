import { describe, expect, test } from "bun:test";

const projectsSource = await Bun.file(new URL("./projects.ts", import.meta.url)).text();
const terminalFocusSource = await Bun.file(new URL("./terminal-focus.ts", import.meta.url)).text();

describe("terminal iframe focus behavior", () => {
	test("terminal iframes are focusable and keep clipboard permission policy", () => {
		expect(projectsSource).toContain('iframe.tabIndex = 0;');
		expect(projectsSource).toContain('iframe.setAttribute("allow", "clipboard-read; clipboard-write")');
	});

	test("terminal iframe receives focus from user activation", () => {
		expect(projectsSource).toContain('iframe.addEventListener("pointerdown", focusTerminalIframe);');
		expect(terminalFocusSource).toContain('iframe.focus({ preventScroll: true });');
	});
});
