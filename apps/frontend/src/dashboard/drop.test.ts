/**
 * RED gate — spec 007: Drag-and-drop injects path into active terminal.
 *
 * Covers ACs 5 and 6:
 *   AC 5: Frontend toasts "Inserted into terminal: <paths>" on injected: true.
 *   AC 6: Frontend toasts "Terminal not reachable — paths copied. ⌘V to paste."
 *         and calls navigator.clipboard.writeText on injected: false.
 *         navigator.clipboard.writeText must NOT be called on injected: true.
 *
 * RED today because the current drop.ts:
 *   - calls copyToClipboard (which calls navigator.clipboard.writeText) in the
 *     SUCCESS branch — violating AC 6 "no clipboard on success".
 *   - does not branch on response.injected at all (the field doesn't exist yet).
 *   - does not emit the AC-5 or AC-6 toast strings.
 *
 * These source-structure assertions fail against the current implementation and
 * will pass only after the implementer rewrites handleOSFileDrop to branch on
 * the `injected` field with the specified toast/clipboard side-effects.
 */

import { describe, expect, test } from "bun:test";

const dropSource = await Bun.file(new URL("./drop.ts", import.meta.url)).text();

describe("drop.ts frontend — AC 5 & 6: injected branching, toast text, clipboard contract", () => {
	// -----------------------------------------------------------------------
	// AC 5: success toast text
	// -----------------------------------------------------------------------
	test("success branch emits 'Inserted into terminal:' toast on injected: true", () => {
		// RED: current drop.ts does not contain this string (it emits "Saved to .drops/").
		expect(dropSource).toContain("Inserted into terminal:");
	});

	// -----------------------------------------------------------------------
	// AC 6a: failure toast text
	// -----------------------------------------------------------------------
	test("failure branch emits 'Terminal not reachable — paths copied. ⌘V to paste.' toast on injected: false", () => {
		// RED: current drop.ts does not contain this string.
		expect(dropSource).toContain("Terminal not reachable — paths copied. ⌘V to paste.");
	});

	// -----------------------------------------------------------------------
	// AC 6b: clipboard is touched only on injected: false
	// The implementation must gate clipboard writes behind injected === false.
	// Pattern: the clipboard call must be inside a conditional block that
	// checks `injected === false` or `!injected` (not at the top level of
	// the success path).
	// -----------------------------------------------------------------------
	test("copyToClipboard / clipboard.writeText is NOT called unconditionally on success", () => {
		// RED: current drop.ts calls copyToClipboard in the success branch without
		// checking `injected`. Assert that the source does NOT call clipboard
		// on the unconditional success path.
		//
		// We check that a clipboard call does NOT appear before the injected
		// branch — specifically: after `r.ok` check, the source must branch on
		// `injected` before calling any clipboard API.
		//
		// Approximation: the string "copyToClipboard" or "clipboard.writeText"
		// must not appear outside an `injected` conditional.
		// We assert the source contains an `injected` guard before clipboard use.
		expect(dropSource).toContain("injected");
		// The clipboard write must only be called when injected is false/falsy.
		// Assert: there is no code path where clipboard is written before the
		// injected check (i.e., the successful response handler must check
		// data.injected before touching clipboard).
		const successHandlerRegion =
			dropSource.match(/if\s*\(!r\.ok\)[\s\S]*?\{[\s\S]*?\}([\s\S]+)/)?.[1] ?? "";
		// The region after the !r.ok block must not call copyToClipboard or
		// clipboard.writeText without first gating on injected === false.
		// Currently it does — that is the RED.
		expect(successHandlerRegion).not.toMatch(/^[^}]*copyToClipboard[^}]*(?:(?!\binjected\b).)*}/s);
	});

	// -----------------------------------------------------------------------
	// AC 6c: clipboard IS called on injected: false path
	// -----------------------------------------------------------------------
	test("clipboard write IS called on the injected: false path", () => {
		// RED: current drop.ts does not branch on injected at all.
		// Assert the source contains logic that calls clipboard under injected: false.
		// Pattern: `injected` check followed by clipboard/copyToClipboard in the else/false branch.
		expect(dropSource).toMatch(/injected[\s\S]{0,200}(?:copyToClipboard|clipboard\.writeText)/);
	});

	// -----------------------------------------------------------------------
	// Structural: response is destructured for the injected field
	// -----------------------------------------------------------------------
	test("response data is destructured or accessed for the injected field", () => {
		// RED: current drop.ts casts response as { files: Array<...> } only — no injected.
		expect(dropSource).toMatch(/\binjected\b/);
	});

	// -----------------------------------------------------------------------
	// Structural: POST target is the new global /api/drops endpoint (spec 019)
	// -----------------------------------------------------------------------
	test("drop.ts posts to /api/drops (not per-project /api/projects/:id/drop)", () => {
		// Spec 019 moved drops to the global endpoint.
		expect(dropSource).toContain("/api/drops");
		expect(dropSource).not.toContain("projects[");
		expect(dropSource).not.toContain('":id"');
	});

	// -----------------------------------------------------------------------
	// Structural: activeProjectId is included in FormData
	// -----------------------------------------------------------------------
	test("FormData includes activeProjectId field for global drops endpoint", () => {
		expect(dropSource).toContain("activeProjectId");
	});

	// -----------------------------------------------------------------------
	// Structural: no clipboard call on the injected: true branch
	// Assert the string "Inserted into terminal:" and NOT clipboard in same branch.
	// -----------------------------------------------------------------------
	test("Inserted into terminal toast fires without a clipboard.writeText call on the same branch", () => {
		// RED: success branch currently calls copyToClipboard before injected is checked.
		// Check: in the same code region that produces "Inserted into terminal:", there
		// must be NO call to copyToClipboard or clipboard.writeText.
		const insertedIndex = dropSource.indexOf("Inserted into terminal:");
		expect(insertedIndex).toBeGreaterThan(-1); // fails RED (string not present yet)

		// Find the enclosing if-block for the "Inserted into terminal" toast.
		// It should not contain clipboard calls.
		const regionAround = dropSource.slice(Math.max(0, insertedIndex - 200), insertedIndex + 200);
		expect(regionAround).not.toContain("copyToClipboard");
		expect(regionAround).not.toContain("clipboard.writeText");
	});
});
