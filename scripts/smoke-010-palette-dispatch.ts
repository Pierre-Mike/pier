/**
 * Smoke gate for spec 010: Double-shift command palette for projects and files.
 *
 * Validates palette behavioral contracts end-to-end without a DOM, without a
 * running server, and without mocks for the core state machine. Drives
 * everything through the single `installPalette` export.
 *
 * Checks:
 *   1. installPalette is exported and returns a handle with the expected shape.
 *   2. Two taps within 300ms → isOpen() true.
 *   3. Two taps >300ms apart → isOpen() false.
 *   4. AC6 relay: two real MessageEvents dispatched on relayTarget → isOpen() true.
 *      (Fails if the implementer never calls relayTarget.addEventListener("message",...))
 *   5. AC6 relay + native mix: one tap + one MessageEvent → opens.
 *   6. AC7 project row: close() fires BEFORE selectProject(id) — verified by
 *      inspecting isOpen() inside the selectProject mock.
 *   7. AC8 file row: close() fires BEFORE openViewer() — same pattern.
 *   8. Entry ordering: projects before files.
 *   9. Fuzzy filter: matching entries ranked above non-matching entries.
 *
 * RED: palette.ts does not exist yet — the import below will throw, producing
 * a non-zero exit. That is correct RED behaviour.
 *
 * Exits 0 on all checks pass, 1 on any failure.
 */

import { installPalette } from "../apps/frontend/src/dashboard/palette.ts";

function fail(msg: string): never {
	console.error(`[smoke-010] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[smoke-010] ok: ${msg}`);
}

const PROJECTS = [
	{ id: "p-alpha", name: "Alpha", path: "/alpha", isGitRepo: false as const, lastModified: 0 },
	{ id: "p-beta", name: "Beta", path: "/beta", isGitRepo: false as const, lastModified: 0 },
];

const FILES = [{ path: "src/main.ts" }, { path: "src/utils.ts" }, { path: "README.md" }];

function makeStore(activeProject: string | null = "p-alpha") {
	return () => ({ projects: PROJECTS, files: FILES, activeProject });
}

// ---------------------------------------------------------------------------
// 1. Structural: installPalette is a function and returns a handle
// ---------------------------------------------------------------------------
{
	if (typeof installPalette !== "function") {
		fail(`installPalette must be a function, got ${typeof installPalette}`);
	}

	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore(),
	});

	for (const method of [
		"isOpen",
		"tap",
		"nonShiftKey",
		"esc",
		"getEntries",
		"selectRowAt",
		"dispose",
	] as const) {
		if (typeof handle[method] !== "function") {
			fail(`handle.${method} must be a function, got ${typeof handle[method]}`);
		}
	}

	handle.dispose();
	pass("installPalette returns a handle with the required shape");
}

// ---------------------------------------------------------------------------
// 2. Two taps within 300ms → opens
// ---------------------------------------------------------------------------
{
	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore(),
	});

	const base = 1_000;
	handle.tap(base);
	handle.tap(base + 200);

	if (!handle.isOpen()) fail("palette did not open on two taps within 300ms");
	handle.dispose();
	pass("two taps within 300ms → isOpen true");
}

// ---------------------------------------------------------------------------
// 3. Two taps >300ms apart → does not open
// ---------------------------------------------------------------------------
{
	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore(),
	});

	const base = 1_000;
	handle.tap(base);
	handle.tap(base + 400);

	if (handle.isOpen()) fail("palette opened on two taps >300ms apart (should not)");
	handle.dispose();
	pass("two taps >300ms apart → isOpen false");
}

// ---------------------------------------------------------------------------
// 4. AC6 relay wiring: two real MessageEvents on relayTarget open the palette
//    This check fails if the implementer never calls
//    relayTarget.addEventListener("message", ...).
// ---------------------------------------------------------------------------
{
	const relayTarget = new EventTarget();

	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
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

	if (!handle.isOpen()) {
		fail(
			"palette did not open on two relay MessageEvents — " +
				"implementer likely forgot relayTarget.addEventListener('message', ...)",
		);
	}
	handle.dispose();
	pass("AC6: two relay MessageEvents via relayTarget → isOpen true");
}

// ---------------------------------------------------------------------------
// 5. AC6 relay mix: native tap + relay MessageEvent → opens
// ---------------------------------------------------------------------------
{
	const relayTarget = new EventTarget();

	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore(),
		relayTarget,
	});

	const base = 3_000;
	handle.tap(base);
	relayTarget.dispatchEvent(
		new MessageEvent("message", { data: { type: "palette-shift-tap", t: base + 100 } }),
	);

	if (!handle.isOpen()) fail("palette did not open on native tap + relay MessageEvent mix");
	handle.dispose();
	pass("AC6: native tap + relay MessageEvent mix → isOpen true");
}

// ---------------------------------------------------------------------------
// 6. AC7 project row: close() fires BEFORE selectProject(id)
//    Verified by checking isOpen() === false inside the selectProject callback.
// ---------------------------------------------------------------------------
{
	let isOpenAtSelectTime: boolean | null = null;
	let selectedId: string | null = null;

	let paletteHandle!: ReturnType<typeof installPalette>;

	paletteHandle = installPalette({
		selectProject: (id: string) => {
			isOpenAtSelectTime = paletteHandle.isOpen();
			selectedId = id;
			return Promise.resolve();
		},
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore("p-alpha"),
	});

	paletteHandle.tap(1_000);
	paletteHandle.tap(1_100);

	if (!paletteHandle.isOpen()) fail("palette did not open for AC7 test");

	const entries = paletteHandle.getEntries("");
	const projectIdx = entries.findIndex((e) => e.kind === "project");
	if (projectIdx < 0) fail("no project entries found in AC7 test");

	paletteHandle.selectRowAt(projectIdx);

	if (isOpenAtSelectTime !== false) {
		fail(
			`close() must fire before selectProject(): isOpen() was ${isOpenAtSelectTime} inside selectProject`,
		);
	}
	if (selectedId === null) fail("selectProject was not called");
	if (!["p-alpha", "p-beta"].includes(selectedId)) {
		fail(`selectProject called with unexpected id: ${selectedId}`);
	}

	paletteHandle.dispose();
	pass("AC7: close() fires before selectProject(id) — project row");
}

// ---------------------------------------------------------------------------
// 7. AC8 file row: close() fires BEFORE openViewer(projectId, path)
// ---------------------------------------------------------------------------
{
	let isOpenAtOpenViewerTime: boolean | null = null;
	let calledPid: string | null = null;
	let calledPath: string | null = null;

	let paletteHandle!: ReturnType<typeof installPalette>;

	paletteHandle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (pid: string, path: string) => {
			isOpenAtOpenViewerTime = paletteHandle.isOpen();
			calledPid = pid;
			calledPath = path;
		},
		getStore: makeStore("p-alpha"),
	});

	paletteHandle.tap(1_000);
	paletteHandle.tap(1_100);

	if (!paletteHandle.isOpen()) fail("palette did not open for AC8 test");

	const entries = paletteHandle.getEntries("");
	const fileIdx = entries.findIndex((e) => e.kind === "file");
	if (fileIdx < 0) fail("no file entries found in AC8 test");

	paletteHandle.selectRowAt(fileIdx);

	if (isOpenAtOpenViewerTime !== false) {
		fail(
			`close() must fire before openViewer(): isOpen() was ${isOpenAtOpenViewerTime} inside openViewer`,
		);
	}
	if (calledPid !== "p-alpha") fail(`openViewer called with wrong projectId: ${calledPid}`);
	if (calledPath === null) fail("openViewer was not called with a path");

	paletteHandle.dispose();
	pass("AC8: close() fires before openViewer() — file row");
}

// ---------------------------------------------------------------------------
// 8. Entry ordering: projects before files
// ---------------------------------------------------------------------------
{
	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: makeStore("p-alpha"),
	});

	handle.tap(1_000);
	handle.tap(1_100);

	const entries = handle.getEntries("");
	const firstProjectIdx = entries.findIndex((e) => e.kind === "project");
	const firstFileIdx = entries.findIndex((e) => e.kind === "file");

	if (firstProjectIdx < 0) fail("no project entries found");
	if (firstFileIdx < 0) fail("no file entries found");
	if (firstProjectIdx >= firstFileIdx) {
		fail(
			`project entry (idx ${firstProjectIdx}) must appear before file entry (idx ${firstFileIdx})`,
		);
	}

	handle.dispose();
	pass("entry ordering: projects before files");
}

// ---------------------------------------------------------------------------
// 9. Fuzzy filter: matching entries ranked above non-matching
// ---------------------------------------------------------------------------
{
	const handle = installPalette({
		selectProject: (_id: string) => Promise.resolve(),
		openViewer: (_pid: string, _path: string) => undefined,
		getStore: () => ({
			projects: [
				{
					id: "zz",
					name: "zzz-unrelated",
					path: "/zz",
					isGitRepo: false as const,
					lastModified: 0,
				},
				{
					id: "foo",
					name: "foo-project",
					path: "/foo",
					isGitRepo: false as const,
					lastModified: 0,
				},
			],
			files: [{ path: "src/foo.ts" }, { path: "bar/index.ts" }],
			activeProject: "foo",
		}),
	});

	handle.tap(1_000);
	handle.tap(1_100);

	const result = handle.getEntries("foo");

	if (result.length < 2) fail("expected at least 2 matching entries for query 'foo'");

	const hasNonMatch = result.some((e) => !e.label.toLowerCase().includes("foo"));
	if (hasNonMatch) {
		const lastMatch = Math.max(
			...result.map((e, i) => (e.label.toLowerCase().includes("foo") ? i : -1)),
		);
		const firstNonMatch = Math.min(
			...result.map((e, i) => (!e.label.toLowerCase().includes("foo") ? i : 999)),
		);
		if (lastMatch >= firstNonMatch) {
			fail("non-matching entry appears before a matching entry");
		}
	}

	handle.dispose();
	pass("fuzzy filter: matches ranked above non-matches");
}

// ---------------------------------------------------------------------------
// All checks passed
// ---------------------------------------------------------------------------
console.log("[smoke-010] PASS — all palette behavioral contracts verified");
process.exit(0);
