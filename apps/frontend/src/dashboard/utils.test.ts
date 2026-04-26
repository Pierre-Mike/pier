import { describe, expect, it } from "bun:test";
import { escapeHTML, fmtDur, projectInitial, safeParse } from "./utils.ts";

describe("escapeHTML", () => {
	it("escapes the five HTML metacharacters", () => {
		expect(escapeHTML(`<a href="x">'&'</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
		);
	});
	it("returns empty string for null/undefined", () => {
		expect(escapeHTML(null)).toBe("");
		expect(escapeHTML(undefined)).toBe("");
	});
});

describe("safeParse", () => {
	it("returns parsed value for valid JSON", () => {
		expect(safeParse<{ a: number }>(`{"a":1}`)).toEqual({ a: 1 });
	});
	it("returns null for invalid JSON instead of throwing", () => {
		expect(safeParse("not json")).toBeNull();
	});
});

describe("projectInitial", () => {
	it("returns uppercase first non-space character", () => {
		expect(projectInitial("  pier")).toBe("P");
	});
	it("returns ? for empty string", () => {
		expect(projectInitial("")).toBe("?");
	});
});

describe("fmtDur", () => {
	it("formats sub-second as ms", () => {
		expect(fmtDur(250)).toBe("250ms");
	});
	it("formats sub-minute as seconds", () => {
		expect(fmtDur(1500)).toBe("1.50s");
	});
	it("formats sub-hour as minutes", () => {
		expect(fmtDur(90_000)).toBe("1.5m");
	});
	it("passes through non-finite input", () => {
		expect(fmtDur(Number.NaN)).toBe("NaN");
	});
});
