/**
 * Double-shift command palette — spec 010, perf fix spec 039, file-search spec 041.
 *
 * Exports a single `installPalette(deps) → PaletteHandle` factory.
 * All state-machine logic is pure (timestamps passed in, no Date.now() calls
 * inside the machine) so it is deterministic and testable without fake timers.
 *
 * spec 039: Snapshot-identity memoisation — `getStore()` is called once per
 * `getEntries` invocation. `selectRowAt` reuses the cached entries from the
 * last `getEntries` call rather than calling `getStore()` independently.
 * Cache is invalidated when `getStore()` returns a different object reference.
 *
 * spec 041: File search moves from store.files to palette-local state.
 * - `StoreSnapshot.files` removed — palette never reads store.files.
 * - `PaletteDeps.fetchFileResults` is the async search hook.
 * - `PaletteHandle.setSearchResults` is the test injection point.
 * - `PaletteHandle.triggerSearch` fires fetchFileResults synchronously (for tests).
 * - `searchResults` cleared on: close, dispose, empty query.
 */

export interface Project {
	id: string;
	name: string;
	path: string;
	isGitRepo: boolean;
	lastModified: number;
}

export interface StoreSnapshot {
	projects: Project[];
	activeProject: string | null;
}

export interface PaletteEntry {
	kind: "project" | "file";
	label: string;
	/** Opaque id used internally by selectRowAt */
	_id: string;
	/** File path — only set for kind === "file" */
	_path?: string;
}

export interface PaletteHandle {
	isOpen(): boolean;
	tap(t: number, mods?: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): void;
	nonShiftKey(): void;
	esc(): void;
	getEntries(query: string): ReadonlyArray<{ kind: "project" | "file"; label: string }>;
	selectRowAt(index: number): void;
	/** Inject search results directly — test injection point (spec 041). */
	setSearchResults(results: ReadonlyArray<PaletteEntry>): void;
	/**
	 * Fire fetchFileResults synchronously with the given query — test injection
	 * point for verifying that fetchFileResults is called (spec 041 AC4).
	 */
	triggerSearch(query: string): Promise<void>;
	dispose(): void;
}

export interface PaletteDeps {
	selectProject: (id: string) => Promise<void>;
	openViewer: (projectId: string, path: string) => void;
	getStore?: () => StoreSnapshot;
	/**
	 * Async file search callback. Called (debounced 150ms, with AbortController)
	 * when the user types a non-empty query. Returns PaletteEntry[] with kind "file".
	 * spec 041 AC4.
	 */
	fetchFileResults?: (query: string, signal: AbortSignal) => Promise<ReadonlyArray<PaletteEntry>>;
	/** EventTarget for postMessage relay. Defaults to globalThis. */
	relayTarget?: EventTarget;
}

const DOUBLE_SHIFT_WINDOW_MS = 300;

// ---------------------------------------------------------------------------
// Fuzzy filter: entries containing the query substring rank above others.
// Within each tier (match / no-match), original order is preserved.
//
// spec 039: removed redundant double-filter pass.
// ---------------------------------------------------------------------------
function applyFuzzyFilter(
	entries: ReadonlyArray<PaletteEntry>,
	query: string,
): ReadonlyArray<PaletteEntry> {
	if (!query) return entries;
	const q = query.toLowerCase();
	const matches: PaletteEntry[] = [];
	for (const entry of entries) {
		if (entry.label.toLowerCase().includes(q)) {
			matches.push(entry);
		}
	}
	return matches;
}

// ---------------------------------------------------------------------------
// Build the unified entry list from the store snapshot.
// spec 041: projects only — no files from store.
// ---------------------------------------------------------------------------
function buildEntries(snapshot: StoreSnapshot): ReadonlyArray<PaletteEntry> {
	const projects = [...snapshot.projects]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(
			(p): PaletteEntry => ({
				kind: "project",
				label: p.name,
				_id: p.id,
			}),
		);

	return projects;
}

// ---------------------------------------------------------------------------
// installPalette — public factory
// ---------------------------------------------------------------------------
export function installPalette(deps: PaletteDeps): PaletteHandle {
	const { selectProject, openViewer, getStore, fetchFileResults } = deps;
	const relayTarget: EventTarget = deps.relayTarget ?? (globalThis as EventTarget);

	// --- State ---
	let open = false;
	let lastShiftTime: number | null = null;
	/** Tracks the last query passed to getEntries so selectRowAt uses the same filtered view. */
	let _lastQuery = "";
	/** Snapshot-identity cache (spec 039). Invalidated when getStore() returns a new reference. */
	let lastSnapshot: StoreSnapshot | null = null;
	let cachedProjectEntries: ReadonlyArray<PaletteEntry> = [];
	/** spec 041: file search results, populated via fetchFileResults / setSearchResults. */
	let searchResults: ReadonlyArray<PaletteEntry> = [];
	/** Cached result of the last getEntries call — selectRowAt uses this to avoid calling getStore(). */
	let lastComputedEntries: ReadonlyArray<PaletteEntry> = [];

	// --- Helpers ---
	function close(): void {
		open = false;
		searchResults = [];
	}

	/**
	 * Returns the cached project PaletteEntry list, rebuilding only when the snapshot
	 * reference has changed (spec 039 — snapshot-identity memoisation).
	 */
	function resolveProjectEntries(): ReadonlyArray<PaletteEntry> {
		const snapshot: StoreSnapshot = getStore ? getStore() : { projects: [], activeProject: null };
		if (snapshot !== lastSnapshot) {
			lastSnapshot = snapshot;
			cachedProjectEntries = buildEntries(snapshot);
		}
		return cachedProjectEntries;
	}

	/** Merge project entries (filtered by query) + searchResults (filtered by query). */
	function resolveAllEntries(query: string): ReadonlyArray<PaletteEntry> {
		const projects = resolveProjectEntries();
		// With empty query: projects only (no searchResults — spec 041 AC3/AC6).
		if (!query) return projects;
		const filteredProjects = applyFuzzyFilter(projects, query);
		const filteredSearch = applyFuzzyFilter(searchResults, query);
		return [...filteredProjects, ...filteredSearch];
	}

	function processTap(t: number): void {
		if (lastShiftTime !== null && t - lastShiftTime <= DOUBLE_SHIFT_WINDOW_MS) {
			// Double-shift detected — toggle
			if (open) {
				close();
			} else {
				open = true;
			}
			lastShiftTime = null;
		} else {
			// First tap of a potential pair
			lastShiftTime = t;
		}
	}

	// --- Relay message listener ---
	function onRelayMessage(ev: Event): void {
		if (!(ev instanceof MessageEvent)) return;
		const data = ev.data as { type?: string; t?: number } | null;
		if (!data || data.type !== "palette-shift-tap") return;
		const t = typeof data.t === "number" ? data.t : Date.now();
		processTap(t);
	}

	relayTarget.addEventListener("message", onRelayMessage);

	// --- PaletteHandle ---
	const handle: PaletteHandle = {
		isOpen(): boolean {
			return open;
		},

		tap(t: number, mods?: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): void {
			if (mods && (mods.ctrlKey || mods.metaKey || mods.altKey)) return;
			processTap(t);
		},

		nonShiftKey(): void {
			lastShiftTime = null;
		},

		esc(): void {
			if (open) close();
		},

		getEntries(query: string): ReadonlyArray<{ kind: "project" | "file"; label: string }> {
			_lastQuery = query;
			// spec 041 AC6: clear searchResults on empty query
			if (!query) searchResults = [];
			lastComputedEntries = resolveAllEntries(query);
			return lastComputedEntries;
		},

		setSearchResults(results: ReadonlyArray<PaletteEntry>): void {
			searchResults = results;
		},

		async triggerSearch(query: string): Promise<void> {
			if (!fetchFileResults || !query) return;
			const controller = new AbortController();
			const results = await fetchFileResults(query, controller.signal);
			searchResults = results;
		},

		selectRowAt(index: number): void {
			// Reuse the cached entries from the last getEntries call — no getStore() call
			// (spec 039: selectRowAt must not call getStore independently when cache is warm).
			const entry = lastComputedEntries[index];
			if (!entry) return;

			// Close BEFORE dispatch
			close();

			if (entry.kind === "project") {
				void selectProject(entry._id);
			} else {
				const path = entry._path ?? entry.label;
				openViewer(entry._id, path);
			}
		},

		dispose(): void {
			relayTarget.removeEventListener("message", onRelayMessage);
			open = false;
			lastShiftTime = null;
			lastSnapshot = null;
			cachedProjectEntries = [];
			searchResults = [];
			lastComputedEntries = [];
		},
	};

	return handle;
}
