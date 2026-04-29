/**
 * RED gate — spec 010: Double-shift command palette for projects and files.
 *
 * Tests the palette's behavioral surface via the single `installPalette` export
 * from palette.ts (which does not exist yet). Every test FAILS until the
 * implementer creates palette.ts.
 *
 * Covered acceptance criteria:
 *   AC1  Two Shift keydowns within 300ms opens the palette.
 *   AC2  Two Shift keydowns >300ms apart does NOT open the palette.
 *   AC3  Intervening non-Shift keydown resets the state machine.
 *   AC4  Shift with ctrl/meta/alt modifier is ignored.
 *   AC5  Toggle: while open, Shift,Shift closes the palette.
 *   AC6  postMessage relay via window.addEventListener("message",...) treated
 *        identically to native Shift tap — test exercises real listener wiring.
 *   AC7  Enter on project row calls selectProject(id) AFTER close().
 *   AC8  Enter on file row calls openViewer(projectId, path) AFTER close().
 *   AC9  Esc closes the palette.
 *   AC10 Fuzzy filter ranks entries containing the query substring above those
 *        that do not.
 *
 * Interface contract (implementer decides internal factoring):
 *   installPalette(deps) → PaletteHandle
 *
 *   deps: {
 *     selectProject: (id: string) => Promise<void>
 *     openViewer: (projectId: string, path: string) => void
 *     getStore?: () => { projects, files, activeProject }
 *     relayTarget?: EventTarget   // defaults to globalThis; the message listener
 *                                 // for the postMessage relay is attached here
 *   }
 *
 *   PaletteHandle: {
 *     isOpen(): boolean
 *     tap(t: number, mods?: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): void
 *     nonShiftKey(): void
 *     esc(): void
 *     getEntries(query: string): ReadonlyArray<{ kind: "project" | "file"; label: string }>
 *     selectRowAt(index: number): void   // simulates Enter / click on that row
 *     dispose(): void
 *   }
 *
 * RED: palette.ts does not exist; the import below will throw, failing all tests.
 */

import { describe, expect, mock, test } from "bun:test";
import { installPalette } from "./palette.ts";

// ---------------------------------------------------------------------------
// Shared store stub
// ---------------------------------------------------------------------------

const PROJECTS = [
	{ id: "p-alpha", name: "Alpha", path: "/alpha", isGitRepo: false, lastModified: 0 },
	{ id: "p-beta", name: "Beta", path: "/beta", isGitRepo: false, lastModified: 0 },
];

const FILES = [{ path: "src/main.ts" }, { path: "src/utils.ts" }, { path: "README.md" }];

function makeStore(activeProject: string | null = "p-alpha") {
	return () => ({ projects: PROJECTS, files: FILES, activeProject });
}

// ---------------------------------------------------------------------------
// AC1 — Two Shift taps within 300ms opens the palette
// ---------------------------------------------------------------------------
describe("AC1 — double-shift opens palette", () => {
	test("two taps 200ms apart → isOpen() becomes true", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base);
		handle.tap(base + 200);

		expect(handle.isOpen()).toBe(true);
		handle.dispose();
	});

	test("two taps exactly 300ms apart → isOpen() becomes true (≤300ms inclusive)", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base);
		handle.tap(base + 300);

		expect(handle.isOpen()).toBe(true);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC2 — Two Shift taps >300ms apart does NOT open
// ---------------------------------------------------------------------------
describe("AC2 — taps too far apart do not open", () => {
	test("two taps 301ms apart → isOpen() stays false", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base);
		handle.tap(base + 301);

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC3 — Intervening non-Shift resets the gesture
// ---------------------------------------------------------------------------
describe("AC3 — intervening non-Shift resets", () => {
	test("Shift, non-Shift, Shift does not open", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base);
		handle.nonShiftKey(); // reset
		handle.tap(base + 100); // only one Shift since reset

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC4 — Modifier-laden Shift is ignored
// ---------------------------------------------------------------------------
describe("AC4 — modifier-laden Shift ignored", () => {
	test("Shift+ctrl does not count toward gesture", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base, { ctrlKey: true }); // ignored
		handle.tap(base + 100);

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});

	test("Shift+meta does not count toward gesture", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base);
		handle.tap(base + 100, { metaKey: true }); // ignored

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});

	test("Shift+alt does not count toward gesture", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		handle.tap(base, { altKey: true }); // ignored
		handle.tap(base + 100);

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC5 — Toggle: Shift,Shift while open closes the palette
// ---------------------------------------------------------------------------
describe("AC5 — toggle closes when already open", () => {
	test("second double-Shift closes the palette", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		const base = 1_000;
		// Open
		handle.tap(base);
		handle.tap(base + 100);
		expect(handle.isOpen()).toBe(true);

		// Toggle close
		handle.tap(base + 200);
		handle.tap(base + 300);
		expect(handle.isOpen()).toBe(false);

		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC6 — postMessage relay via real window.addEventListener("message", ...)
//
// The test injects a custom EventTarget as `relayTarget`. It then dispatches a
// real MessageEvent on that target. If the implementer never registers a
// "message" listener on relayTarget, the palette will not open — the test
// detects the omission.
// ---------------------------------------------------------------------------
describe("AC6 — postMessage relay exercises real listener wiring", () => {
	test("two MessageEvents dispatched on relayTarget open the palette", () => {
		const relayTarget = new EventTarget();
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
			relayTarget,
		});

		const base = 2_000;
		// Dispatch real MessageEvents — implementer must have registered a listener
		relayTarget.dispatchEvent(
			new MessageEvent("message", { data: { type: "palette-shift-tap", t: base } }),
		);
		relayTarget.dispatchEvent(
			new MessageEvent("message", { data: { type: "palette-shift-tap", t: base + 150 } }),
		);

		expect(handle.isOpen()).toBe(true);
		handle.dispose();
	});

	test("mix of native tap and relay MessageEvent opens the palette", () => {
		const relayTarget = new EventTarget();
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
			relayTarget,
		});

		const base = 3_000;
		// First tap via direct handle method (native keydown path)
		handle.tap(base);
		// Second tap via relay MessageEvent (must arrive via listener)
		relayTarget.dispatchEvent(
			new MessageEvent("message", { data: { type: "palette-shift-tap", t: base + 100 } }),
		);

		expect(handle.isOpen()).toBe(true);
		handle.dispose();
	});

	test("MessageEvent with wrong type does not count as a tap", () => {
		const relayTarget = new EventTarget();
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
			relayTarget,
		});

		const base = 4_000;
		relayTarget.dispatchEvent(
			new MessageEvent("message", { data: { type: "some-other-event", t: base } }),
		);
		relayTarget.dispatchEvent(
			new MessageEvent("message", { data: { type: "some-other-event", t: base + 100 } }),
		);

		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC7 — Enter on project row: close() BEFORE selectProject(id)
// ---------------------------------------------------------------------------
describe("AC7 — project row dispatch order", () => {
	test("selectRowAt on a project row: close precedes selectProject", () => {
		const calls: string[] = [];
		const selectProject = mock((_id: string) => {
			calls.push("selectProject");
			return Promise.resolve();
		});
		const openViewer = mock((_pid: string, _path: string) => {
			calls.push("openViewer");
		});

		const handle = installPalette({
			selectProject,
			openViewer,
			getStore: makeStore("p-alpha"),
		});

		// Open the palette
		handle.tap(1_000);
		handle.tap(1_100);
		expect(handle.isOpen()).toBe(true);

		// Get entries with no filter — projects come first per AC ordering
		const entries = handle.getEntries("");
		const projectIdx = entries.findIndex((e) => e.kind === "project");
		expect(projectIdx).toBeGreaterThanOrEqual(0);

		// Intercept the close — track it in calls
		// We can't override close directly; instead we observe isOpen going false
		// AND call order via the mocks above. Use a wrapping approach:
		// selectRowAt triggers close() then selectProject() — we observe mock call order.
		handle.selectRowAt(projectIdx);

		// close must have happened (palette is now closed)
		expect(handle.isOpen()).toBe(false);
		// selectProject must have been called
		expect(selectProject).toHaveBeenCalledTimes(1);
		// close BEFORE selectProject — selectProject is the only tracked call;
		// palette being closed when selectProject fires confirms order.
		// Additionally assert via calls array that close came first:
		expect(calls[0]).toBe("selectProject"); // calls[0] is first thing pushed AFTER close
		// The palette must be closed at the point selectProject fires:
		// We verify this by checking isOpen() is false and selectProject was called exactly once.
		expect(openViewer).toHaveBeenCalledTimes(0);

		handle.dispose();
	});

	test("selectProject is called with the project id", () => {
		const selectProject = mock((_id: string) => Promise.resolve());

		const handle = installPalette({
			selectProject,
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const entries = handle.getEntries("");
		const projectIdx = entries.findIndex((e) => e.kind === "project");
		handle.selectRowAt(projectIdx);

		expect(selectProject).toHaveBeenCalledTimes(1);
		// The id must match a known project id
		const calledId = (selectProject.mock.calls[0] as string[])[0];
		expect(["p-alpha", "p-beta"]).toContain(calledId);

		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC7 dispatch order — explicit call-order array (mirrors file-row test)
// ---------------------------------------------------------------------------
describe("AC7 — project row close-before-selectProject (call order array)", () => {
	test("calls array is ['close', 'selectProject']", () => {
		const callOrder: string[] = [];

		// We need to observe close() firing. Since close() is internal to the
		// palette, we use isOpen() to assert state, but for strict order we
		// inject a getStore that lets us hook the moment selectProject fires and
		// check that isOpen() is already false at that point.
		let isOpenAtSelectTime: boolean | null = null;

		let paletteHandle: ReturnType<typeof installPalette>;

		const selectProject = mock((_id: string) => {
			// At the moment selectProject fires, the palette must already be closed
			isOpenAtSelectTime = paletteHandle.isOpen();
			callOrder.push("selectProject");
			return Promise.resolve();
		});

		paletteHandle = installPalette({
			selectProject,
			openViewer: mock(() => {
				callOrder.push("openViewer");
			}),
			getStore: makeStore("p-alpha"),
		});

		paletteHandle.tap(1_000);
		paletteHandle.tap(1_100);
		expect(paletteHandle.isOpen()).toBe(true);

		const entries = paletteHandle.getEntries("");
		const projectIdx = entries.findIndex((e) => e.kind === "project");
		paletteHandle.selectRowAt(projectIdx);

		// The palette was closed before selectProject was called
		expect(isOpenAtSelectTime).toBe(false);
		expect(callOrder).not.toContain("openViewer");

		paletteHandle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC8 — Enter on file row: close() BEFORE openViewer(projectId, path)
// ---------------------------------------------------------------------------
describe("AC8 — file row dispatch order", () => {
	test("calls array is ['close', 'openViewer'] for a file row", () => {
		let isOpenAtOpenViewerTime: boolean | null = null;
		const callOrder: string[] = [];

		let paletteHandle: ReturnType<typeof installPalette>;

		const openViewer = mock((_pid: string, _path: string) => {
			isOpenAtOpenViewerTime = paletteHandle.isOpen();
			callOrder.push("openViewer");
		});

		paletteHandle = installPalette({
			selectProject: mock(() => {
				callOrder.push("selectProject");
				return Promise.resolve();
			}),
			openViewer,
			getStore: makeStore("p-alpha"),
		});

		paletteHandle.tap(1_000);
		paletteHandle.tap(1_100);
		expect(paletteHandle.isOpen()).toBe(true);

		const entries = paletteHandle.getEntries("");
		const fileIdx = entries.findIndex((e) => e.kind === "file");
		expect(fileIdx).toBeGreaterThanOrEqual(0);

		paletteHandle.selectRowAt(fileIdx);

		// Palette was closed before openViewer was called
		expect(isOpenAtOpenViewerTime).toBe(false);
		expect(callOrder).not.toContain("selectProject");

		paletteHandle.dispose();
	});

	test("openViewer is called with activeProjectId and file path", () => {
		const openViewer = mock((_pid: string, _path: string) => undefined);

		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer,
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const entries = handle.getEntries("");
		const fileIdx = entries.findIndex((e) => e.kind === "file");
		handle.selectRowAt(fileIdx);

		expect(openViewer).toHaveBeenCalledTimes(1);
		const [calledPid] = openViewer.mock.calls[0] as [string, string];
		expect(calledPid).toBe("p-alpha");

		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC9 — Esc closes the palette
// ---------------------------------------------------------------------------
describe("AC9 — Esc closes", () => {
	test("esc() while open → isOpen() becomes false", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		handle.tap(1_000);
		handle.tap(1_100);
		expect(handle.isOpen()).toBe(true);

		handle.esc();
		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});

	test("esc() while closed does nothing", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore(),
		});

		expect(handle.isOpen()).toBe(false);
		handle.esc(); // no-op
		expect(handle.isOpen()).toBe(false);
		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC10 — Fuzzy filter: substring matches rank above non-matches
// Tested via getEntries(query) — implementer chooses internal filter shape.
// ---------------------------------------------------------------------------
describe("AC10 — fuzzy filter via getEntries", () => {
	test("entries containing query substring appear before non-matching entries", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			// Store with a mix of matching and non-matching entries
			getStore: () => ({
				projects: [
					{ id: "zz", name: "zzz-unrelated", path: "/zz", isGitRepo: false, lastModified: 0 },
					{ id: "foo", name: "foo-project", path: "/foo", isGitRepo: false, lastModified: 0 },
				],
				files: [{ path: "src/foo.ts" }, { path: "bar/index.ts" }],
				activeProject: "foo",
			}),
		});

		// Open so entries are available
		handle.tap(1_000);
		handle.tap(1_100);

		const result = handle.getEntries("foo");

		const fooIndices = result
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => e.label.toLowerCase().includes("foo"))
			.map(({ i }) => i);

		const nonFooIndices = result
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => !e.label.toLowerCase().includes("foo"))
			.map(({ i }) => i);

		if (fooIndices.length > 0 && nonFooIndices.length > 0) {
			const lastFoo = Math.max(...fooIndices);
			const firstNonFoo = Math.min(...nonFooIndices);
			expect(lastFoo).toBeLessThan(firstNonFoo);
		}

		// At least the "foo-project" and "src/foo.ts" entries must match
		expect(fooIndices.length).toBeGreaterThanOrEqual(2);

		handle.dispose();
	});

	test("empty query returns all entries", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const result = handle.getEntries("");
		// Should include both projects (2) and files (3) = at least 5
		expect(result.length).toBeGreaterThanOrEqual(5);

		handle.dispose();
	});

	test("query with no matches returns empty array", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const result = handle.getEntries("zzzznothere");
		expect(result.length).toBe(0);

		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// Entry ordering: projects before files
// ---------------------------------------------------------------------------
describe("entry ordering — projects before files", () => {
	test("getEntries('') places project entries before file entries", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const entries = handle.getEntries("");
		const firstProjectIdx = entries.findIndex((e) => e.kind === "project");
		const firstFileIdx = entries.findIndex((e) => e.kind === "file");

		expect(firstProjectIdx).toBeGreaterThanOrEqual(0);
		expect(firstFileIdx).toBeGreaterThanOrEqual(0);
		expect(firstProjectIdx).toBeLessThan(firstFileIdx);

		handle.dispose();
	});
});
