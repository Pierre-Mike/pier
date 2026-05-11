/**
 * Smoke gate — spec 039: Fix double-shift palette performance freeze.
 *
 * Validates the two core behavioral fixes in palette.ts:
 *
 *   1. selectRowAt reuses cached snapshot from getEntries — getStore is NOT
 *      called again during selectRowAt when entries are already cached.
 *   2. Cache invalidation — a new snapshot reference from getStore() triggers
 *      a rebuild and returns updated entries.
 *   3. applyFuzzyFilter calls getStore exactly once per getEntries call
 *      (no double-pass that would call getStore twice).
 *
 * RED: The unoptimised implementation calls getStore() independently in both
 * getEntries and selectRowAt — Check 1 will fail (callsForSelectRowAt === 1,
 * expected 0).
 *
 * Exits 0 on all checks pass, 1 on any failure.
 */

import { installPalette } from "../apps/frontend/src/dashboard/palette.ts";

function fail(msg: string): never {
	console.error(`[smoke-039] FAIL: ${msg}`);
	process.exit(1);
}

function pass(msg: string): void {
	console.log(`[smoke-039] ok: ${msg}`);
}

// ---------------------------------------------------------------------------
// Check 1 — selectRowAt reuses cached snapshot, does NOT call getStore again
// ---------------------------------------------------------------------------
{
	let callCount = 0;
	const snapshot = {
		projects: [
			{ id: "p1", name: "Alpha", path: "/a", isGitRepo: false as const, lastModified: 0 },
			{ id: "p2", name: "Beta", path: "/b", isGitRepo: false as const, lastModified: 0 },
		],
		files: [] as Array<{ path: string }>,
		activeProject: null as string | null,
	};

	let selectedId: string | null = null;
	const handle = installPalette({
		selectProject: (id) => {
			selectedId = id;
			return Promise.resolve();
		},
		openViewer: () => undefined,
		getStore: () => {
			callCount++;
			return snapshot;
		},
	});

	// getEntries should call getStore (at least once) to build entries
	callCount = 0;
	handle.getEntries("");
	const callsForGetEntries = callCount;

	// selectRowAt must NOT call getStore again when cache is warm
	callCount = 0;
	handle.selectRowAt(0);
	const callsForSelectRowAt = callCount;

	handle.dispose();

	if (callsForGetEntries < 1) {
		fail(`Check 1: getEntries called getStore ${callsForGetEntries} times — must be ≥1`);
	}
	if (callsForSelectRowAt !== 0) {
		fail(
			`Check 1: selectRowAt called getStore ${callsForSelectRowAt} time(s) — must be 0 when cache is warm`,
		);
	}
	if (selectedId !== "p1") {
		fail(`Check 1: expected selectProject("p1"), got "${selectedId}"`);
	}
	pass(
		`Check 1: selectRowAt did not call getStore (cache hit) — getEntries called it ${callsForGetEntries} time(s)`,
	);
}

// ---------------------------------------------------------------------------
// Check 2 — cache invalidation on new snapshot reference
// ---------------------------------------------------------------------------
{
	let snapshotVersion = {
		projects: [{ id: "p1", name: "Alpha", path: "/a", isGitRepo: false as const, lastModified: 0 }],
		files: [] as Array<{ path: string }>,
		activeProject: null as string | null,
	};

	const handle = installPalette({
		selectProject: () => Promise.resolve(),
		openViewer: () => undefined,
		getStore: () => snapshotVersion,
	});

	const firstCount = handle.getEntries("").length;

	// Replace snapshot reference — new object → cache should invalidate
	snapshotVersion = {
		...snapshotVersion,
		projects: [
			...snapshotVersion.projects,
			{ id: "p2", name: "Beta", path: "/b", isGitRepo: false as const, lastModified: 1 },
		],
	};

	const secondCount = handle.getEntries("").length;
	handle.dispose();

	if (secondCount !== firstCount + 1) {
		fail(`Check 2: expected ${firstCount + 1} entries after snapshot change, got ${secondCount}`);
	}
	pass(`Check 2: cache invalidated on new snapshot ref — ${firstCount} → ${secondCount}`);
}

// ---------------------------------------------------------------------------
// Check 3 — getStore called exactly once per getEntries (no double-pass)
// ---------------------------------------------------------------------------
{
	let callCount = 0;
	const snapshot = {
		projects: [
			{ id: "p1", name: "alpha", path: "/a", isGitRepo: false as const, lastModified: 0 },
			{ id: "p2", name: "beta", path: "/b", isGitRepo: false as const, lastModified: 0 },
		],
		files: [] as Array<{ path: string }>,
		activeProject: null as string | null,
	};

	const handle = installPalette({
		selectProject: () => Promise.resolve(),
		openViewer: () => undefined,
		getStore: () => {
			callCount++;
			return snapshot;
		},
	});

	callCount = 0;
	const result = handle.getEntries("alpha");
	handle.dispose();

	if (!result.some((e) => e.label === "alpha")) {
		fail("Check 3: matching entry 'alpha' not in result");
	}
	if (callCount !== 1) {
		fail(`Check 3: getEntries called getStore ${callCount} time(s) — must be exactly 1`);
	}
	pass(`Check 3: getEntries called getStore exactly once — no double-pass in applyFuzzyFilter`);
}

console.log("[smoke-039] all checks passed");
