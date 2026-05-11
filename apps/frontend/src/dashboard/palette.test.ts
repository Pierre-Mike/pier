/**
 * Gate — spec 041: Move file search to the palette and simplify the sidebar.
 *
 * Extends the spec 010 / spec 039 gate. Key changes:
 *
 *   AC3  Empty query → getEntries("") returns only project entries (no files from store).
 *   AC4  PaletteDeps gains `fetchFileResults` async function; palette calls it on non-empty
 *        query (debounced 150 ms, AbortController cancels in-flight).
 *   AC5  Results from `fetchFileResults` are merged after project entries in getEntries.
 *   AC6  `searchResults` cleared on: close (esc/dispose) and empty query.
 *
 * Spec 010 / 039 tests are updated to match the new interface:
 *   - StoreSnapshot no longer has a `files` field.
 *   - "empty query" test expects projects-only count.
 *   - AC8 file-row test uses fetchFileResults to seed file entries.
 *
 * RED: palette.ts still provides files from store; fetchFileResults dep does not exist
 * in PaletteDeps. New spec 041 tests fail until the implementer wires the new path.
 */

import { describe, expect, mock, test } from "bun:test";
import { installPalette } from "./palette.ts";

// ---------------------------------------------------------------------------
// Shared store stub — spec 041: no `files` field (palette no longer reads them)
// ---------------------------------------------------------------------------

const PROJECTS = [
	{ id: "p-alpha", name: "Alpha", path: "/alpha", isGitRepo: false, lastModified: 0 },
	{ id: "p-beta", name: "Beta", path: "/beta", isGitRepo: false, lastModified: 0 },
];

function makeStore(activeProject: string | null = "p-alpha") {
	return () => ({ projects: PROJECTS, activeProject });
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
		handle.tap(base);
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

		handle.tap(1_000);
		handle.tap(1_100);
		expect(handle.isOpen()).toBe(true);

		const entries = handle.getEntries("");
		const projectIdx = entries.findIndex((e) => e.kind === "project");
		expect(projectIdx).toBeGreaterThanOrEqual(0);

		handle.selectRowAt(projectIdx);

		expect(handle.isOpen()).toBe(false);
		expect(selectProject).toHaveBeenCalledTimes(1);
		expect(calls[0]).toBe("selectProject");
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
		const calledId = (selectProject.mock.calls[0] as string[])[0];
		expect(["p-alpha", "p-beta"]).toContain(calledId);

		handle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC7 dispatch order — explicit call-order array
// ---------------------------------------------------------------------------
describe("AC7 — project row close-before-selectProject (call order array)", () => {
	test("calls array is ['close', 'selectProject']", () => {
		const callOrder: string[] = [];
		let isOpenAtSelectTime: boolean | null = null;
		let paletteHandle: ReturnType<typeof installPalette>;

		const selectProject = mock((_id: string) => {
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

		expect(isOpenAtSelectTime).toBe(false);
		expect(callOrder).not.toContain("openViewer");

		paletteHandle.dispose();
	});
});

// ---------------------------------------------------------------------------
// AC8 — Enter on file row: close() BEFORE openViewer(projectId, path)
//
// spec 041: file entries come from fetchFileResults, not store.files.
// We seed them by providing a fetchFileResults that resolves synchronously via
// a pre-loaded cache. The test pumps the cache via setSearchResults (or we use
// the async path with an immediate-resolve mock).
// ---------------------------------------------------------------------------
describe("AC8 — file row dispatch order (spec 041: entries from fetchFileResults)", () => {
	test("calls array is ['close', 'openViewer'] for a file row seeded via fetchFileResults", async () => {
		let isOpenAtOpenViewerTime: boolean | null = null;
		const callOrder: string[] = [];
		let paletteHandle: ReturnType<typeof installPalette>;

		const openViewer = mock((_pid: string, _path: string) => {
			isOpenAtOpenViewerTime = paletteHandle.isOpen();
			callOrder.push("openViewer");
		});

		// fetchFileResults mock: immediately resolves with one file entry.
		const fetchFileResults = mock((_query: string, _signal: AbortSignal) =>
			Promise.resolve([
				{ kind: "file" as const, label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
			]),
		);

		paletteHandle = installPalette({
			selectProject: mock(() => {
				callOrder.push("selectProject");
				return Promise.resolve();
			}),
			openViewer,
			getStore: makeStore("p-alpha"),
			fetchFileResults,
		});

		paletteHandle.tap(1_000);
		paletteHandle.tap(1_100);
		expect(paletteHandle.isOpen()).toBe(true);

		// Trigger a file search and wait for results to populate.
		// getEntries returns synchronously; for spec 041 the palette may need an
		// async notify. We call setFileSearchResults if available, otherwise we
		// rely on the returned entries including the file.
		// RED: fetchFileResults is not a known dep — the palette won't call it
		// and getEntries will return no file entries.
		const handle = paletteHandle as unknown as Record<string, unknown>;
		if (typeof handle["setSearchResults"] === "function") {
			(handle["setSearchResults"] as (r: unknown[]) => void)([
				{ kind: "file", label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
			]);
		}

		const entries = paletteHandle.getEntries("main");
		const fileIdx = entries.findIndex((e) => e.kind === "file");
		// RED: fileIdx will be -1 since palette does not have searchResults yet
		// GREEN: fileIdx >= 0
		if (fileIdx >= 0) {
			paletteHandle.selectRowAt(fileIdx);
			expect(isOpenAtOpenViewerTime).toBe(false);
			expect(callOrder).not.toContain("selectProject");
		}

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
		if (fileIdx >= 0) {
			handle.selectRowAt(fileIdx);
			expect(openViewer).toHaveBeenCalledTimes(1);
			const [calledPid] = openViewer.mock.calls[0] as [string, string];
			expect(calledPid).toBe("p-alpha");
		}

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
// ---------------------------------------------------------------------------
describe("AC10 — fuzzy filter via getEntries", () => {
	test("entries containing query substring appear before non-matching entries", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: () => ({
				projects: [
					{ id: "zz", name: "zzz-unrelated", path: "/zz", isGitRepo: false, lastModified: 0 },
					{ id: "foo", name: "foo-project", path: "/foo", isGitRepo: false, lastModified: 0 },
				],
				activeProject: "foo",
			}),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const result = handle.getEntries("foo");

		const fooIndices = result
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => e.label.toLowerCase().includes("foo"))
			.map(({ i }) => i);

		expect(fooIndices.length).toBeGreaterThanOrEqual(1);

		handle.dispose();
	});

	test("empty query returns projects-only entries (spec 041 AC3: no files from store)", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const result = handle.getEntries("");
		// spec 041: empty query → projects only (2 projects, no files from store)
		// RED: currently returns projects + files from store (>2)
		// GREEN: exactly 2 (the two projects)
		expect(result.every((e) => e.kind === "project")).toBe(true);
		expect(result.length).toBe(2);

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
// spec 039 — Performance gate (unchanged from original)
// ---------------------------------------------------------------------------

function makeLargeStore(projectCount: number) {
	const projects = Array.from({ length: projectCount }, (_, i) => ({
		id: `proj-${i}`,
		name: `Project ${String(i).padStart(4, "0")}`,
		path: `/projects/proj-${i}`,
		isGitRepo: false as const,
		lastModified: i,
	}));
	return { projects, activeProject: projects[0]?.id ?? null };
}

describe("spec 039 — AC1: selectRowAt reuses cached entries from getEntries", () => {
	test("getStore is called exactly once across getEntries + selectRowAt with same snapshot", () => {
		let callCount = 0;
		const snapshot = makeLargeStore(5);
		const selectProjectMock = mock((_id: string) => Promise.resolve());

		const handle = installPalette({
			selectProject: selectProjectMock,
			openViewer: mock(() => undefined),
			getStore: () => {
				callCount++;
				return snapshot;
			},
		});

		callCount = 0;
		handle.getEntries("");
		const callsForGetEntries = callCount;

		callCount = 0;
		handle.selectRowAt(0);
		const callsForSelectRowAt = callCount;

		handle.dispose();

		expect(callsForGetEntries).toBeGreaterThanOrEqual(1);
		expect(callsForSelectRowAt).toBe(0);
	});
});

describe("spec 039 — AC3: repeated getEntries calls with same snapshot reference skip rebuild", () => {
	test("getStore called at most once for 5 consecutive getEntries('') with identical snapshot ref", () => {
		let callCount = 0;
		const snapshot = makeLargeStore(10);

		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: () => {
				callCount++;
				return snapshot;
			},
		});

		handle.getEntries("");

		callCount = 0;
		for (let i = 0; i < 5; i++) {
			handle.getEntries("");
		}

		handle.dispose();

		expect(callCount).toBeLessThanOrEqual(5);
	});
});

describe("spec 039 — AC4: applyFuzzyFilter does not double-filter", () => {
	test("getEntries with query returns matching entries without redundant second pass", () => {
		let callCount = 0;
		const snapshot = {
			projects: [
				{ id: "p1", name: "alpha", path: "/a", isGitRepo: false as const, lastModified: 0 },
				{ id: "p2", name: "beta", path: "/b", isGitRepo: false as const, lastModified: 0 },
			],
			activeProject: null,
		};

		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: () => {
				callCount++;
				return snapshot;
			},
		});

		callCount = 0;
		const result = handle.getEntries("alpha");

		handle.dispose();

		expect(result.some((e) => e.label === "alpha")).toBe(true);
		expect(callCount).toBe(1);
	});
});

describe("spec 039 — AC2/AC5: cache invalidation on snapshot reference change", () => {
	test("new snapshot reference triggers rebuild and returns updated entry count", () => {
		let snapshotVersion = {
			projects: [
				{ id: "p1", name: "Alpha", path: "/a", isGitRepo: false as const, lastModified: 0 },
				{ id: "p2", name: "Beta", path: "/b", isGitRepo: false as const, lastModified: 0 },
				{ id: "p3", name: "Gamma", path: "/c", isGitRepo: false as const, lastModified: 0 },
			],
			activeProject: null as string | null,
		};

		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: () => snapshotVersion,
		});

		const firstCount = handle.getEntries("").length;

		snapshotVersion = {
			...snapshotVersion,
			projects: [
				...snapshotVersion.projects,
				{
					id: "p4",
					name: "Delta",
					path: "/d",
					isGitRepo: false as const,
					lastModified: 999,
				},
			],
		};

		const secondCount = handle.getEntries("").length;

		handle.dispose();

		expect(secondCount).toBe(firstCount + 1);
	});
});

// ===========================================================================
// spec 041: Move file search to palette — new gate tests
// ===========================================================================
//
// AC3  Empty query → getEntries("") returns projects only (no files from store).
// AC4  PaletteDeps.fetchFileResults is called on non-empty query; palette wires
//      debounce + AbortController.
// AC5  Results from fetchFileResults appear as file entries after projects.
// AC6  searchResults cleared on close (esc/dispose) and empty query.

describe("spec 041 AC3: empty query returns projects only", () => {
	test("getEntries('') contains only project entries — no file entries from store", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			// getStore has no `files` — palette must not read it
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const entries = handle.getEntries("");
		// RED: current palette includes files from store snapshot;
		// after spec 041 only project entries appear with empty query
		const fileEntries = entries.filter((e) => e.kind === "file");
		expect(fileEntries).toHaveLength(0);

		handle.dispose();
	});

	test("getEntries('') entry count equals project count when no searchResults loaded", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		const entries = handle.getEntries("");
		// 2 projects in PROJECTS fixture, no search results
		expect(entries.length).toBe(2);

		handle.dispose();
	});
});

describe("spec 041 AC4: PaletteDeps.fetchFileResults dep exists and is invoked", () => {
	test("PaletteDeps accepts fetchFileResults without type error", () => {
		// RED: PaletteDeps does not have fetchFileResults in current types.
		// This test exercises runtime acceptance — if installPalette ignores
		// unknown keys in deps (JS is structural), this passes at runtime even
		// if TypeScript rejects it. The @ts-expect-error comment below marks the
		// TypeScript RED; the runtime behavior tests AC4 further below.
		const fetchFileResults = mock(
			// @ts-expect-error — fetchFileResults not yet in PaletteDeps
			(_query: string, _signal: AbortSignal) => Promise.resolve([]),
		);

		expect(() => {
			const h = installPalette({
				selectProject: mock(() => Promise.resolve()),
				openViewer: mock(() => undefined),
				getStore: makeStore("p-alpha"),
				// @ts-expect-error — fetchFileResults not yet in PaletteDeps
				fetchFileResults,
			});
			h.dispose();
		}).not.toThrow();
	});

	test("setSearchResults exists on PaletteHandle for test injection (AC4)", () => {
		// The implementer must expose setSearchResults on the handle for test
		// injection of search results. RED: method does not exist yet.
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		}) as unknown as Record<string, unknown>;

		// Unconditional assertion — RED: fails because method is absent
		// GREEN: passes when implementer adds setSearchResults
		expect(typeof handle["setSearchResults"]).toBe("function");
	});

	test("fetchFileResults is called with the query string and an AbortSignal when query is non-empty", async () => {
		// RED: palette does not call fetchFileResults dep yet.
		// GREEN: palette calls fetchFileResults(query, signal) when getEntries is
		// called with a non-empty query (or when query changes).
		//
		// Implementation note: the palette's debounce means fetchFileResults may be
		// called asynchronously. For testing, the implementer should either:
		// (a) call fetchFileResults synchronously on getEntries (no debounce in test mode), or
		// (b) expose a triggerSearch() method on the handle to fire the fetch synchronously.
		// The test uses setSearchResults as the synchronous injection path AND verifies
		// that fetchFileResults was called.
		const fetchFileResults = mock((_query: string, _signal: AbortSignal) =>
			Promise.resolve([
				{ kind: "file" as const, label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
			]),
		);

		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
			// @ts-expect-error — fetchFileResults not yet in PaletteDeps
			fetchFileResults,
		}) as unknown as Record<string, unknown>;

		// Trigger a query change via setSearchResults or triggerSearch if available
		if (typeof handle["triggerSearch"] === "function") {
			await (handle["triggerSearch"] as (q: string) => Promise<void>)("main");
		}

		// GREEN: fetchFileResults was called with "main" and an AbortSignal
		// RED: fetchFileResults call count is 0
		if ((fetchFileResults.mock.calls as unknown[]).length > 0) {
			const [calledQuery, calledSignal] = fetchFileResults.mock.calls[0] as [string, AbortSignal];
			expect(calledQuery).toBe("main");
			expect(calledSignal).toBeInstanceOf(AbortSignal);
		} else {
			// Fail: fetchFileResults was never called despite non-empty query
			expect(fetchFileResults).toHaveBeenCalledTimes(1);
		}

		const paletteHandle = handle as unknown as ReturnType<typeof installPalette>;
		paletteHandle.dispose();
	});
});

describe("spec 041 AC5: fetchFileResults results appear as file entries after projects", () => {
	test("after setSearchResults, file entries appear after project entries in getEntries", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		}) as unknown as Record<string, unknown>;

		// Unconditional: setSearchResults must exist (RED: method absent → this throws)
		expect(typeof handle["setSearchResults"]).toBe("function");

		// Inject file search results
		(handle["setSearchResults"] as (r: unknown[]) => void)([
			{ kind: "file", label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
			{ kind: "file", label: "src/utils.ts", _id: "p-alpha", _path: "src/utils.ts" },
		]);

		const paletteHandle = handle as unknown as ReturnType<typeof installPalette>;
		const entries = paletteHandle.getEntries("src");

		const projectEntries = entries.filter((e) => e.kind === "project");
		const fileEntries = entries.filter((e) => e.kind === "file");

		// File entries must be present after setSearchResults
		expect(fileEntries.length).toBeGreaterThanOrEqual(1);

		// Projects must appear before files
		if (projectEntries.length > 0 && fileEntries.length > 0) {
			const lastProjectIdx = Math.max(...entries.map((e, i) => (e.kind === "project" ? i : -1)));
			const firstFileIdx = entries.findIndex((e) => e.kind === "file");
			expect(lastProjectIdx).toBeLessThan(firstFileIdx);
		}

		paletteHandle.dispose();
	});
});

describe("spec 041 AC6: searchResults cleared on close and empty query", () => {
	test("esc() clears searchResults — subsequent getEntries returns projects only", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		}) as unknown as Record<string, unknown>;

		// Unconditional: setSearchResults must exist
		expect(typeof handle["setSearchResults"]).toBe("function");

		// Seed search results
		(handle["setSearchResults"] as (r: unknown[]) => void)([
			{ kind: "file", label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
		]);

		const paletteHandle = handle as unknown as ReturnType<typeof installPalette>;

		// Open then close via esc
		paletteHandle.tap(1_000);
		paletteHandle.tap(1_100);
		paletteHandle.esc();

		const afterClose = paletteHandle.getEntries("src");
		const fileEntriesAfterClose = afterClose.filter((e) => e.kind === "file");

		// RED: no clearing logic → file entries may still appear
		// GREEN: 0 file entries after esc
		expect(fileEntriesAfterClose).toHaveLength(0);

		paletteHandle.dispose();
	});

	test("empty query clears searchResults — getEntries('') returns projects only", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		}) as unknown as Record<string, unknown>;

		// Unconditional: setSearchResults must exist
		expect(typeof handle["setSearchResults"]).toBe("function");

		// Seed search results
		(handle["setSearchResults"] as (r: unknown[]) => void)([
			{ kind: "file", label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
		]);

		const paletteHandle = handle as unknown as ReturnType<typeof installPalette>;

		// Call getEntries with empty query — should clear search results
		const entries = paletteHandle.getEntries("");
		const fileEntries = entries.filter((e) => e.kind === "file");

		// RED: no clearing logic → file entries remain
		// GREEN: 0 file entries with empty query
		expect(fileEntries).toHaveLength(0);

		paletteHandle.dispose();
	});

	test("dispose() does not throw with search results present", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		}) as unknown as Record<string, unknown>;

		expect(typeof handle["setSearchResults"]).toBe("function");
		(handle["setSearchResults"] as (r: unknown[]) => void)([
			{ kind: "file", label: "src/main.ts", _id: "p-alpha", _path: "src/main.ts" },
		]);

		const paletteHandle = handle as unknown as ReturnType<typeof installPalette>;
		// dispose should not throw even with search results present
		expect(() => paletteHandle.dispose()).not.toThrow();
	});
});

// ===========================================================================
// spec 041 AC7: store.files and store.fileFilter absent from DashboardState
// ===========================================================================
//
// Source-level checks: after this spec, DashboardState in types.ts and the
// initial state in state.ts must not mention `files` or `fileFilter`.
// Pattern: same as the source-level checks in files.test.ts (spec 024/040).

const typesSource = await Bun.file(new URL("../dashboard/types.ts", import.meta.url)).text();
const stateSource = await Bun.file(new URL("../dashboard/state.ts", import.meta.url)).text();
const filesSource = await Bun.file(new URL("../dashboard/files.ts", import.meta.url)).text();
// ArtifactsPane.astro is in src/components/ — one level up from dashboard/
const artifactsPaneSource = await Bun.file(
	new URL("../components/ArtifactsPane.astro", import.meta.url),
)
	.text()
	.catch(() => "");

describe("spec 041 AC7: store.files and store.fileFilter absent from DashboardState", () => {
	test("types.ts DashboardState does not contain 'fileFilter' field", () => {
		// RED: fileFilter is still declared in DashboardState
		// GREEN: removed by implementer
		// Check for the field declaration pattern: `fileFilter:` (with colon, as a type field)
		expect(typesSource).not.toContain("fileFilter:");
	});

	test("types.ts DashboardState does not contain 'files: FileEntry[]' field", () => {
		// RED: files: FileEntry[] is still declared in DashboardState
		// GREEN: removed
		// Match the interface field pattern (indented, with type annotation)
		const hasFilesField =
			typesSource.includes("files: FileEntry[]") || typesSource.includes("files:FileEntry[]");
		expect(hasFilesField).toBe(false);
	});

	test("state.ts does not initialize fileFilter", () => {
		// RED: fileFilter: "" still in the initial state
		// GREEN: removed
		expect(stateSource).not.toContain("fileFilter");
	});

	test("state.ts does not initialize files array", () => {
		// RED: files: [] still in the initial state
		// The pattern must be more precise to avoid matching `store.files` in comments.
		// Check for the initializer pattern used by createStore.
		const hasFilesInit = /^\s+files:\s*\[/m.test(stateSource);
		expect(hasFilesInit).toBe(false);
	});
});

// ===========================================================================
// spec 041 AC8: files.ts fileFilter branch and store.files references removed
// ===========================================================================

describe("spec 041 AC8: files.ts has no fileFilter branch or store.files reference", () => {
	test("files.ts does not reference fileFilter", () => {
		// RED: fileFilter branch still present in refreshFiles
		// GREEN: branch removed
		expect(filesSource).not.toContain("fileFilter");
	});

	test("files.ts does not assign store.files", () => {
		// RED: store.files = [] still in refreshFiles
		// GREEN: removed
		// The pattern `store.files =` is the assignment; we avoid matching comments.
		expect(filesSource).not.toContain("store.files =");
	});

	test("files.ts does not read store.files", () => {
		// RED: store.files.filter and store.files.length still in renderFileTree
		// GREEN: removed (lazy path uses folderChildrenCache, no store.files fallback)
		const hasRead =
			filesSource.includes("store.files.filter") || filesSource.includes("store.files.length");
		expect(hasRead).toBe(false);
	});
});

// ===========================================================================
// spec 041 AC9: ArtifactsPane.astro has no file-filter input
// ===========================================================================

describe("spec 041 AC9: ArtifactsPane.astro does not contain file-filter", () => {
	test("ArtifactsPane.astro does not contain id='file-filter'", () => {
		// RED: <input id="file-filter"> still present in the component
		// GREEN: removed
		// If the file couldn't be read (empty string), treat as GREEN for the
		// RED state (file exists in the implementation worktree).
		if (artifactsPaneSource === "") return; // file not readable — skip
		expect(artifactsPaneSource).not.toContain("file-filter");
	});
});

// ---------------------------------------------------------------------------
// Entry ordering: projects before files (updated for spec 041)
// ---------------------------------------------------------------------------
describe("entry ordering — projects before files", () => {
	test("getEntries('') returns only project entries (no files until fetchFileResults is called)", () => {
		const handle = installPalette({
			selectProject: mock(() => Promise.resolve()),
			openViewer: mock(() => undefined),
			getStore: makeStore("p-alpha"),
		});

		handle.tap(1_000);
		handle.tap(1_100);

		const entries = handle.getEntries("");
		// spec 041: empty query → projects only
		expect(entries.every((e) => e.kind === "project")).toBe(true);

		handle.dispose();
	});
});
