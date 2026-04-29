/**
 * Smoke gate for spec 010: Double-shift command palette for projects and files.
 *
 * Validates the palette module's pure-logic contracts end-to-end without a DOM,
 * without a running server, and without mocks for the core state machine.
 *
 * Checks:
 *   1. palette.ts exports the required symbols (structural contract).
 *   2. The state machine opens on two Shift taps within 300ms.
 *   3. The state machine does NOT open on two taps >300ms apart.
 *   4. A postMessage relay message is treated identically to a native tap.
 *   5. dispatchEntry calls selectProject for a project entry (close before dispatch).
 *   6. dispatchEntry calls openViewer for a file entry (close before dispatch).
 *   7. buildEntries places projects before files.
 *   8. applyFuzzyFilter ranks matches above non-matches.
 *
 * RED: palette.ts does not exist yet. The import below will throw a module-not-
 * found error, causing a non-zero exit. That is correct RED behaviour.
 *
 * Exits 0 on all checks pass, 1 on any failure.
 */

import {
	applyFuzzyFilter,
	buildEntries,
	createPaletteStateMachine,
	dispatchEntry,
	type PaletteEntry,
} from "../apps/frontend/src/dashboard/palette.ts";

function fail(msg: string): never {
	console.error(`[smoke-010] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[smoke-010] ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. Required exports are present (TypeScript structural check)
// ---------------------------------------------------------------------------
{
	const requiredExports = [
		createPaletteStateMachine,
		dispatchEntry,
		buildEntries,
		applyFuzzyFilter,
	] as const;
	for (const exp of requiredExports) {
		if (typeof exp !== "function") {
			fail(`expected function export, got ${typeof exp}`);
		}
	}
	pass("all required exports are functions");
}

// ---------------------------------------------------------------------------
// 2. State machine opens on two Shift taps within 300ms
// ---------------------------------------------------------------------------
{
	let opened = false;
	const sm = createPaletteStateMachine({
		onOpen: () => {
			opened = true;
		},
		onClose: () => {
			/* no-op */
		},
	});

	const base = 1_000;
	sm.handleShiftTap({ t: base });
	sm.handleShiftTap({ t: base + 200 });

	if (!opened) fail("palette did not open on two Shift taps within 300ms");
	pass("opens on two Shift taps within 300ms");
}

// ---------------------------------------------------------------------------
// 3. State machine does NOT open on two taps >300ms apart
// ---------------------------------------------------------------------------
{
	let opened = false;
	const sm = createPaletteStateMachine({
		onOpen: () => {
			opened = true;
		},
		onClose: () => {
			/* no-op */
		},
	});

	const base = 1_000;
	sm.handleShiftTap({ t: base });
	sm.handleShiftTap({ t: base + 400 });

	if (opened) fail("palette opened on two Shift taps >300ms apart (should not)");
	pass("does not open on two taps >300ms apart");
}

// ---------------------------------------------------------------------------
// 4. postMessage relay treated identically to native tap
// ---------------------------------------------------------------------------
{
	let opened = false;
	const sm = createPaletteStateMachine({
		onOpen: () => {
			opened = true;
		},
		onClose: () => {
			/* no-op */
		},
	});

	const base = 2_000;
	sm.handleRelayMessage({ type: "palette-shift-tap", t: base });
	sm.handleRelayMessage({ type: "palette-shift-tap", t: base + 150 });

	if (!opened) fail("palette did not open on two relay messages within 300ms");
	pass("relay messages trigger open");
}

// ---------------------------------------------------------------------------
// 5. dispatchEntry: project row — close before selectProject
// ---------------------------------------------------------------------------
{
	const calls: string[] = [];
	const closeCall = () => calls.push("close");
	const selectProjectCall = (_id: string) => {
		calls.push("selectProject");
		return Promise.resolve();
	};
	const openViewerCall = (_projectId: string, _path: string) => {
		calls.push("openViewer");
	};

	const entry: PaletteEntry = { kind: "project", id: "test-proj", label: "Test Project" };
	dispatchEntry({
		entry,
		activeProjectId: null,
		selectProject: selectProjectCall,
		openViewer: openViewerCall,
		close: closeCall,
	});

	if (calls[0] !== "close") fail(`expected close to be called first, got ${calls[0]}`);
	if (calls[1] !== "selectProject")
		fail(`expected selectProject to be called second, got ${calls[1]}`);
	if (calls.includes("openViewer")) fail("openViewer should not be called for a project row");
	pass("dispatchEntry: project row calls close then selectProject");
}

// ---------------------------------------------------------------------------
// 6. dispatchEntry: file row — close before openViewer
// ---------------------------------------------------------------------------
{
	const calls: string[] = [];
	const closeCall = () => calls.push("close");
	const selectProjectCall = (_id: string) => {
		calls.push("selectProject");
		return Promise.resolve();
	};
	const openViewerCall = (_projectId: string, _path: string) => {
		calls.push("openViewer");
	};

	const entry: PaletteEntry = { kind: "file", path: "src/app.ts", label: "src/app.ts" };
	dispatchEntry({
		entry,
		activeProjectId: "active-proj",
		selectProject: selectProjectCall,
		openViewer: openViewerCall,
		close: closeCall,
	});

	if (calls[0] !== "close") fail(`expected close first, got ${calls[0]}`);
	if (calls[1] !== "openViewer") fail(`expected openViewer second, got ${calls[1]}`);
	if (calls.includes("selectProject")) fail("selectProject should not be called for a file row");
	pass("dispatchEntry: file row calls close then openViewer");
}

// ---------------------------------------------------------------------------
// 7. buildEntries places projects before files
// ---------------------------------------------------------------------------
{
	const projects = [
		{ id: "p1", name: "Alpha", path: "/p1", isGitRepo: false as const, lastModified: 0 },
	];
	const files = [{ path: "src/main.ts" }];

	const entries = buildEntries({ projects, files, activeProjectId: "p1" });

	const firstProjectIdx = entries.findIndex((e) => e.kind === "project");
	const firstFileIdx = entries.findIndex((e) => e.kind === "file");

	if (firstProjectIdx === -1) fail("no project entries found");
	if (firstFileIdx === -1) fail("no file entries found");
	if (firstProjectIdx >= firstFileIdx)
		fail(
			`project entry (idx ${firstProjectIdx}) should appear before file entry (idx ${firstFileIdx})`,
		);

	pass("buildEntries: projects appear before files");
}

// ---------------------------------------------------------------------------
// 8. applyFuzzyFilter ranks matches above non-matches
// ---------------------------------------------------------------------------
{
	const entries: PaletteEntry[] = [
		{ kind: "project", id: "zzz", label: "zzz-unrelated" },
		{ kind: "project", id: "foo", label: "foo-project" },
		{ kind: "file", path: "src/foo.ts", label: "src/foo.ts" },
	];

	const result = applyFuzzyFilter(entries, "foo");

	if (result.length < 2) fail("expected at least 2 matching entries for query 'foo'");

	const hasNonMatch = result.some((e) => !e.label.includes("foo"));
	if (hasNonMatch) {
		const lastMatch = Math.max(...result.map((e, i) => (e.label.includes("foo") ? i : -1)));
		const firstNonMatch = Math.min(...result.map((e, i) => (!e.label.includes("foo") ? i : 999)));
		if (lastMatch >= firstNonMatch) {
			fail("non-matching entry appears before a matching entry");
		}
	}

	pass("applyFuzzyFilter: matches ranked before non-matches");
}

// ---------------------------------------------------------------------------
// All checks passed
// ---------------------------------------------------------------------------
console.log("[smoke-010] PASS — all palette dispatch contracts verified");
process.exit(0);
