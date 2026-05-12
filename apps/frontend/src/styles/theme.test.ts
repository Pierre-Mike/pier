/**
 * Gate — spec 044: Add dark/light mode theming (unit)
 *
 * Verifies that `theme.css` exists and defines both dark and light colour
 * tokens as CSS custom properties. All checks run against the raw file
 * content — no DOM, no browser.
 *
 * RED: theme.css does not exist yet → every test fails.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)));
const themeCssPath = join(stylesDir, "theme.css");

const REQUIRED_TOKENS = [
	"--bg",
	"--bg-elev",
	"--bg-hover",
	"--fg",
	"--fg-dim",
	"--accent",
	"--accent-dim",
	"--border",
	"--danger",
	"--ok",
] as const;

describe("theme.css existence", () => {
	test("theme.css exists at apps/frontend/src/styles/theme.css", () => {
		expect(existsSync(themeCssPath)).toBe(true);
	});
});

describe("theme.css dark tokens", () => {
	test('defines [data-theme="dark"] selector block', () => {
		const css = readFileSync(themeCssPath, "utf8");
		expect(css).toMatch(/\[data-theme="dark"\]/);
	});

	for (const token of REQUIRED_TOKENS) {
		test(`dark mode defines ${token}`, () => {
			const css = readFileSync(themeCssPath, "utf8");
			// Find dark block and verify token presence within it
			const darkBlockMatch = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/s);
			expect(darkBlockMatch).not.toBeNull();
			const darkBlock = darkBlockMatch![1];
			expect(darkBlock).toContain(token);
		});
	}
});

describe("theme.css light tokens", () => {
	test('defines [data-theme="light"] selector block', () => {
		const css = readFileSync(themeCssPath, "utf8");
		expect(css).toMatch(/\[data-theme="light"\]/);
	});

	for (const token of REQUIRED_TOKENS) {
		test(`light mode defines ${token}`, () => {
			const css = readFileSync(themeCssPath, "utf8");
			const lightBlockMatch = css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/s);
			expect(lightBlockMatch).not.toBeNull();
			const lightBlock = lightBlockMatch![1];
			expect(lightBlock).toContain(token);
		});
	}
});

describe("theme.css token parity", () => {
	test("dark and light blocks define the same set of custom properties", () => {
		const css = readFileSync(themeCssPath, "utf8");

		const darkBlockMatch = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/s);
		const lightBlockMatch = css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/s);
		expect(darkBlockMatch).not.toBeNull();
		expect(lightBlockMatch).not.toBeNull();

		const extractVars = (block: string): string[] =>
			[...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] as string).sort();

		const darkVars = extractVars(darkBlockMatch![1]!);
		const lightVars = extractVars(lightBlockMatch![1]!);

		expect(darkVars).toEqual(lightVars);
	});
});
