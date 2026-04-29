/**
 * RED gate — spec 010: Double-shift command palette for projects and files.
 *
 * Tests the palette state machine and dispatch logic in palette.ts (which does
 * not exist yet). Every test in this file FAILS until the implementer creates
 * palette.ts with the specified exports.
 *
 * Covered acceptance criteria:
 *   (a) Two Shift keydowns within 300ms opens the palette.
 *   (b) Two Shift keydowns >300ms apart does NOT open the palette.
 *   (c) Intervening non-Shift keydown resets the state machine.
 *   (d) Shift with ctrl/meta/alt modifier is ignored.
 *   (e) Toggle: while open, Shift,Shift closes the palette.
 *   (f) postMessage relay {type:"palette-shift-tap"} treated identically to native Shift.
 *   (g) Enter on project row calls selectProject.
 *   (h) Enter on file row calls openViewer.
 *   (i) Esc closes the palette.
 *   (j) Fuzzy filter ranks substring matches above non-matches.
 *
 * RED: palette.ts does not exist; the import below will throw, failing all tests.
 */

import { describe, expect, mock, test } from "bun:test";
import {
	applyFuzzyFilter,
	buildEntries,
	createPaletteStateMachine,
	dispatchEntry,
	type PaletteEntry,
} from "./palette.ts";

// ---------------------------------------------------------------------------
// (a) Two Shift keydowns within 300ms opens the palette
// ---------------------------------------------------------------------------
describe("state machine — trigger detection", () => {
	test("two Shift taps within 300ms triggers open", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleShiftTap({ t: base + 200 });

		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(0);
	});

	// (b) >300ms gap does NOT trigger
	test("two Shift taps more than 300ms apart does NOT open", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleShiftTap({ t: base + 301 });

		expect(onOpen).toHaveBeenCalledTimes(0);
	});

	// (c) Intervening non-Shift keydown resets state
	test("intervening non-Shift key resets the state machine", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleNonShiftKey();
		sm.handleShiftTap({ t: base + 100 }); // only one Shift after reset

		expect(onOpen).toHaveBeenCalledTimes(0);
	});

	// (d) Modifier-laden Shift is ignored
	test("Shift with ctrlKey is ignored", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base, ctrlKey: true });
		sm.handleShiftTap({ t: base + 50 });

		expect(onOpen).toHaveBeenCalledTimes(0);
	});

	test("Shift with metaKey is ignored", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleShiftTap({ t: base + 50, metaKey: true });

		expect(onOpen).toHaveBeenCalledTimes(0);
	});

	test("Shift with altKey is ignored", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base, altKey: true });
		sm.handleShiftTap({ t: base + 50 });

		expect(onOpen).toHaveBeenCalledTimes(0);
	});

	// (e) Toggle: when open, Shift,Shift closes
	test("Shift,Shift while open closes the palette (toggle)", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		// Open
		sm.handleShiftTap({ t: base });
		sm.handleShiftTap({ t: base + 100 });
		expect(onOpen).toHaveBeenCalledTimes(1);

		// Close via toggle
		sm.handleShiftTap({ t: base + 200 });
		sm.handleShiftTap({ t: base + 300 });
		expect(onClose).toHaveBeenCalledTimes(1);
		// Should not open again
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	// (f) postMessage relay treated identically
	test("postMessage relay {type:'palette-shift-tap'} counts as a Shift tap", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		// First tap via postMessage relay
		sm.handleRelayMessage({ type: "palette-shift-tap", t: base });
		// Second tap via postMessage relay
		sm.handleRelayMessage({ type: "palette-shift-tap", t: base + 150 });

		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	test("mix of native and relay taps triggers open", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleRelayMessage({ type: "palette-shift-tap", t: base + 100 });

		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// (g) Enter on project row dispatches selectProject
// ---------------------------------------------------------------------------
describe("dispatchEntry — project row", () => {
	test("Enter on project row calls selectProject with the project id after close", () => {
		const selectProject = mock((_id: string) => Promise.resolve());
		const openViewer = mock((_projectId: string, _path: string) => {
			/* no-op mock */
		});
		const close = mock(() => {
			/* no-op mock */
		});

		const entry: PaletteEntry = { kind: "project", id: "proj-1", label: "My Project" };
		dispatchEntry({ entry, activeProjectId: null, selectProject, openViewer, close });

		expect(close).toHaveBeenCalledTimes(1);
		expect(selectProject).toHaveBeenCalledWith("proj-1");
		expect(openViewer).toHaveBeenCalledTimes(0);
	});
});

// ---------------------------------------------------------------------------
// (h) Enter on file row dispatches openViewer
// ---------------------------------------------------------------------------
describe("dispatchEntry — file row", () => {
	test("Enter on file row calls openViewer with activeProjectId and path after close", () => {
		const selectProject = mock((_id: string) => Promise.resolve());
		const openViewer = mock((_projectId: string, _path: string) => {
			/* no-op mock */
		});
		const close = mock(() => {
			/* no-op mock */
		});

		const entry: PaletteEntry = { kind: "file", path: "src/main.ts", label: "src/main.ts" };
		dispatchEntry({
			entry,
			activeProjectId: "proj-1",
			selectProject,
			openViewer,
			close,
		});

		expect(close).toHaveBeenCalledTimes(1);
		expect(openViewer).toHaveBeenCalledWith("proj-1", "src/main.ts");
		expect(selectProject).toHaveBeenCalledTimes(0);
	});

	test("close is called BEFORE openViewer (dispatch order)", () => {
		const calls: string[] = [];
		const selectProject = mock((_id: string) => Promise.resolve());
		const openViewer = mock((_projectId: string, _path: string) => {
			calls.push("openViewer");
		});
		const close = mock(() => {
			calls.push("close");
		});

		const entry: PaletteEntry = { kind: "file", path: "foo.ts", label: "foo.ts" };
		dispatchEntry({ entry, activeProjectId: "p", selectProject, openViewer, close });

		expect(calls).toEqual(["close", "openViewer"]);
	});
});

// ---------------------------------------------------------------------------
// (i) Esc closes the palette
// ---------------------------------------------------------------------------
describe("state machine — Esc key", () => {
	test("handleEsc calls onClose when palette is open", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		// Open first
		const base = 1000;
		sm.handleShiftTap({ t: base });
		sm.handleShiftTap({ t: base + 100 });
		expect(onOpen).toHaveBeenCalledTimes(1);

		sm.handleEsc();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("handleEsc does nothing when palette is already closed", () => {
		const onOpen = mock(() => {
			/* no-op mock */
		});
		const onClose = mock(() => {
			/* no-op mock */
		});
		const sm = createPaletteStateMachine({ onOpen, onClose });

		sm.handleEsc(); // palette not open
		expect(onClose).toHaveBeenCalledTimes(0);
	});
});

// ---------------------------------------------------------------------------
// (j) Fuzzy filter
// ---------------------------------------------------------------------------
describe("applyFuzzyFilter", () => {
	test("entries containing the query substring appear above those that do not", () => {
		const entries: PaletteEntry[] = [
			{ kind: "project", id: "zz", label: "zzz-unrelated" },
			{ kind: "project", id: "foo", label: "foo-project" },
			{ kind: "file", path: "src/foo.ts", label: "src/foo.ts" },
			{ kind: "project", id: "bar", label: "bar-project" },
		];

		const result = applyFuzzyFilter(entries, "foo");

		// All "foo" entries should precede any non-"foo" entry
		const fooIndices = result
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => e.label.includes("foo"))
			.map(({ i }) => i);
		const nonFooIndices = result
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => !e.label.includes("foo"))
			.map(({ i }) => i);

		if (fooIndices.length > 0 && nonFooIndices.length > 0) {
			const lastFoo = Math.max(...fooIndices);
			const firstNonFoo = Math.min(...nonFooIndices);
			expect(lastFoo).toBeLessThan(firstNonFoo);
		}

		// Matching entries are present
		expect(result.filter((e) => e.label.includes("foo"))).toHaveLength(2);
	});

	test("empty query returns all entries unchanged", () => {
		const entries: PaletteEntry[] = [
			{ kind: "project", id: "a", label: "alpha" },
			{ kind: "file", path: "b.ts", label: "b.ts" },
		];
		const result = applyFuzzyFilter(entries, "");
		expect(result).toHaveLength(2);
	});

	test("query with no matches returns empty array", () => {
		const entries: PaletteEntry[] = [{ kind: "project", id: "a", label: "alpha" }];
		const result = applyFuzzyFilter(entries, "zzzznothere");
		expect(result).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// buildEntries — projects first, then active project files
// ---------------------------------------------------------------------------
describe("buildEntries", () => {
	test("projects appear before files in the unified list when no query", () => {
		const projects = [
			{ id: "p1", name: "Alpha", path: "/p1", isGitRepo: false, lastModified: 0 },
			{ id: "p2", name: "Beta", path: "/p2", isGitRepo: false, lastModified: 0 },
		];
		const files = [{ path: "src/main.ts" }, { path: "README.md" }];

		const entries = buildEntries({ projects, files, activeProjectId: "p1" });

		const firstProjectIdx = entries.findIndex((e) => e.kind === "project");
		const firstFileIdx = entries.findIndex((e) => e.kind === "file");

		expect(firstProjectIdx).toBeLessThan(firstFileIdx);
	});

	test("file entries carry kind='file' with correct path", () => {
		const projects = [{ id: "p1", name: "A", path: "/p1", isGitRepo: false, lastModified: 0 }];
		const files = [{ path: "src/index.ts" }];

		const entries = buildEntries({ projects, files, activeProjectId: "p1" });
		const fileEntry = entries.find((e) => e.kind === "file");

		expect(fileEntry).toBeDefined();
		expect(fileEntry?.kind === "file" && fileEntry.path).toBe("src/index.ts");
	});

	test("project entries carry kind='project' with correct id", () => {
		const projects = [{ id: "proj-x", name: "X", path: "/x", isGitRepo: false, lastModified: 0 }];
		const files: { path: string }[] = [];

		const entries = buildEntries({ projects, files, activeProjectId: null });
		const projEntry = entries.find((e) => e.kind === "project");

		expect(projEntry).toBeDefined();
		expect(projEntry?.kind === "project" && projEntry.id).toBe("proj-x");
	});
});
