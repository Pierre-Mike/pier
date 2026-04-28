/**
 * RED gate — spec 007 + spec 008.
 *
 * Spec 007 (source-inspection, tests 1-6):
 *   Covers ACs 5 and 6 of the injected-terminal-path spec:
 *   AC 5: Frontend toasts "Inserted into terminal: <paths>" on injected: true.
 *   AC 6: Frontend toasts "Terminal not reachable — paths copied. ⌘V to paste."
 *         and calls navigator.clipboard.writeText on injected: false.
 *         navigator.clipboard.writeText must NOT be called on injected: true.
 *
 * Spec 008 (runtime, test 7):
 *   AC 1: A synthetic drop event carrying one File results in a multipart
 *         request body whose FormData contains exactly 1 entry under "files".
 *   AC 2: The captured entry's .name matches the original File.name.
 *
 *   RED today because drop.ts passes `form: fd` (a FormData instance) to hc,
 *   and hc does Object.entries(fd) — FormData has no enumerable own keys —
 *   so the body ships empty. getAll("files").length === 0.
 *
 *   Passes after the fix: `form: { files }` lets hc iterate the array and
 *   append each File under the "files" key.
 */

import { describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";

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

// ---------------------------------------------------------------------------
// Spec 008 — Runtime gate: multipart body must contain ≥1 file
//
// This test drives wireTerminalDrop() end-to-end via a synthetic drop event
// and asserts that the Request body actually carries the file. It catches the
// bug that spec 007's source-inspection tests missed: hc's Object.entries(fd)
// yields no entries for a FormData instance, shipping an empty body.
// ---------------------------------------------------------------------------

// Bootstrap a minimal DOM environment for the runtime test.
// Must be at module scope so globals are ready before any dynamic import.
const _happyWin = new GlobalWindow() as unknown as Window & typeof globalThis;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).document = _happyWin.document;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).window = _happyWin;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).MouseEvent = _happyWin.MouseEvent;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).DataTransfer = _happyWin.DataTransfer;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).File = _happyWin.File;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).FormData = _happyWin.FormData;
// biome-ignore lint/suspicious/noExplicitAny: test-only DOM polyfill
(globalThis as any).navigator = _happyWin.navigator;

// Stub ./files before drop.ts is imported so refreshFiles is a no-op.
mock.module("./files", () => ({
	refreshFiles: mock(async (_id: string) => {
		/* no-op */
	}),
}));

describe("drop.ts runtime — spec 008: multipart body carries files", () => {
	test("drop event ships files in multipart body", async () => {
		// Set up a fresh DOM body for this test.
		_happyWin.document.body.innerHTML = '<main><section id="terminals"></section></main>';

		// Stub globalThis.fetch to capture the FormData body that hc builds.
		// hc calls: for (const [k,v] of Object.entries(args.form)) { form.append(k,v) }
		// With args.form = fd (FormData), Object.entries yields [] → empty body (the bug).
		// With args.form = { files } (plain object), Object.entries yields [["files", File[]]]
		// → hc appends each File → body contains the file (the fix).
		let capturedBody: FormData | null = null;
		// biome-ignore lint/suspicious/noExplicitAny: test-only fetch stub
		(globalThis as any).fetch = mock(async (_url: unknown, init: unknown) => {
			const body = (init as RequestInit | undefined)?.body;
			if (body instanceof FormData) {
				capturedBody = body;
			}
			return Response.json(
				{
					files: [{ name: "drop.txt", path: "/p/.pier/drops/drop.txt", size: 7 }],
					injected: true,
				},
				{ status: 200 },
			);
		});

		// Import modules under test after stubs are in place.
		// Dynamic import ensures mock.module stubs are honoured.
		const { wireTerminalDrop } = await import("./drop.ts");
		const { store } = await import("./state.ts");

		// Satisfy the store's activeProject validator.
		store.sessions.set("p", { url: "http://test", sessionId: "p" });
		store.activeProject = "p";

		// Wire drop listeners.
		wireTerminalDrop();

		const host = document.querySelector("#terminals") as HTMLElement;
		expect(host).not.toBeNull();

		// Build a synthetic drop event carrying one real File.
		const file = new File(["content"], "drop.txt", { type: "text/plain" });
		const dt = new _happyWin.DataTransfer();
		// happy-dom's DataTransfer accepts File (same prototype chain via globalThis override)
		dt.items.add(file as unknown as globalThis.File);

		// happy-dom's DragEvent constructor ignores dataTransfer in eventInit,
		// so use MouseEvent + defineProperty to inject the DataTransfer.
		// biome-ignore lint/suspicious/noExplicitAny: test-only event construction
		const dropEvt = new (globalThis as any).MouseEvent("drop", {
			bubbles: true,
			cancelable: true,
		}) as DragEvent;
		Object.defineProperty(dropEvt, "dataTransfer", { value: dt, writable: false });
		Object.defineProperty(dropEvt, "preventDefault", {
			value: () => {
				/* no-op */
			},
			writable: false,
		});

		host.dispatchEvent(dropEvt as unknown as Event);

		// Allow the async drop handler to run.
		await new Promise<void>((r) => setTimeout(r, 200));

		// --- AC 1: body contains ≥1 file ---
		// RED: capturedBody.getAll("files").length === 0 before fix.
		// GREEN: === 1 after fix (form: { files } instead of form: fd).
		expect(capturedBody).not.toBeNull();
		const uploadedFiles = (capturedBody as FormData).getAll("files");
		expect(uploadedFiles.length).toBe(1);

		// --- AC 2: file name is preserved ---
		const uploadedFile = uploadedFiles[0] as File;
		expect(uploadedFile.name).toBe("drop.txt");
	});
});
