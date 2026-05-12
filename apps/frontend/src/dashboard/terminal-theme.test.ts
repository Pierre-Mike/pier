/**
 * Gate — spec 045: Sync iframe terminal theme with UI theme (unit)
 *
 * Tests the `terminal-theme.ts` module using source-text inspection.
 * Pattern follows `terminal-focus.test.ts` (spec 044 pattern).
 *
 * RED: `terminal-theme.ts` does not exist yet → Bun.file read returns empty
 *      or the source checks fail.
 *
 * GREEN after implementation: all assertions pass.
 */

import { describe, expect, test } from "bun:test";

const terminalThemeSource = await Bun.file(new URL("./terminal-theme.ts", import.meta.url)).text();

const themeSource = await Bun.file(new URL("./theme.ts", import.meta.url)).text();

describe("terminal-theme module", () => {
	test("terminal-theme.ts exports syncTerminalTheme function", () => {
		expect(terminalThemeSource).toMatch(/export\s+(function|const)\s+syncTerminalTheme/);
	});

	test("syncTerminalTheme accepts a theme parameter typed as dark|light", () => {
		// The function signature must declare the theme parameter.
		// Accepts either: syncTerminalTheme(theme: "dark" | "light")
		// or a Theme type alias — either form references the theme param name.
		expect(terminalThemeSource).toMatch(/syncTerminalTheme\s*\(\s*theme\b/);
	});

	test("syncTerminalTheme targets terminal iframes (data-project selector or #terminals)", () => {
		// The implementation must query the DOM for active terminal iframes.
		// It must reference either the data-project attribute or the #terminals container.
		const targetsIframes =
			terminalThemeSource.includes("data-project") ||
			terminalThemeSource.includes("#terminals") ||
			terminalThemeSource.includes("HTMLIFrameElement");
		expect(targetsIframes).toBe(true);
	});

	test("syncTerminalTheme sends the theme to iframes (postMessage or URL param or data-theme)", () => {
		// At least one of the valid relay mechanisms must appear in the source.
		const hasRelayMechanism =
			terminalThemeSource.includes("postMessage") ||
			terminalThemeSource.includes("?theme=") ||
			terminalThemeSource.includes("dataset.theme") ||
			terminalThemeSource.includes("searchParams") ||
			terminalThemeSource.includes("URLSearchParams");
		expect(hasRelayMechanism).toBe(true);
	});
});

describe("theme.ts wires syncTerminalTheme", () => {
	test("theme.ts imports syncTerminalTheme from terminal-theme", () => {
		expect(themeSource).toContain("syncTerminalTheme");
	});

	test("theme.ts calls syncTerminalTheme on theme change", () => {
		// syncTerminalTheme must be called (not just imported).
		const callCount = (themeSource.match(/syncTerminalTheme\s*\(/g) ?? []).length;
		expect(callCount).toBeGreaterThanOrEqual(1);
	});
});
