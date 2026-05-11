/**
 * Double-shift command palette — spec 010, perf fix spec 039.
 *
 * Exports a single `installPalette(deps) → PaletteHandle` factory.
 * All state-machine logic is pure (timestamps passed in, no Date.now() calls
 * inside the machine) so it is deterministic and testable without fake timers.
 *
 * spec 039: Snapshot-identity memoisation — `getStore()` is called once per
 * `getEntries` invocation. `selectRowAt` reuses the cached entries from the
 * last `getEntries` call rather than calling `getStore()` independently.
 * Cache is invalidated when `getStore()` returns a different object reference.
 */

export interface Project {
	id: string;
	name: string;
	path: string;
	isGitRepo: boolean;
	lastModified: number;
}

export interface FileEntry {
	path: string;
	size?: number;
}

export interface StoreSnapshot {
	projects: Project[];
	files: FileEntry[];
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
	dispose(): void;
}

export interface PaletteDeps {
	selectProject: (id: string) => Promise<void>;
	openViewer: (projectId: string, path: string) => void;
	getStore?: () => StoreSnapshot;
	/** EventTarget for postMessage relay. Defaults to globalThis. */
	relayTarget?: EventTarget;
}

const DOUBLE_SHIFT_WINDOW_MS = 300;

// ---------------------------------------------------------------------------
// Fuzzy filter: entries containing the query substring rank above others.
// Within each tier (match / no-match), original order is preserved.
//
// spec 039: removed redundant double-filter pass. The previous implementation
// built `[matches, others]` then filtered again — silently discarding `others`
// and doing O(2n) comparisons instead of O(n). Now returns `matches` directly.
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
// Order: projects (alphabetical) then files of active project.
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

	const files = snapshot.activeProject
		? snapshot.files.map(
				(f): PaletteEntry => ({
					kind: "file",
					label: f.path,
					_id: snapshot.activeProject as string,
					_path: f.path,
				}),
			)
		: [];

	return [...projects, ...files];
}

// ---------------------------------------------------------------------------
// installPalette — public factory
// ---------------------------------------------------------------------------
export function installPalette(deps: PaletteDeps): PaletteHandle {
	const { selectProject, openViewer, getStore } = deps;
	const relayTarget: EventTarget = deps.relayTarget ?? (globalThis as EventTarget);

	// --- State ---
	let open = false;
	let lastShiftTime: number | null = null;
	/** Tracks the last query passed to getEntries so selectRowAt uses the same filtered view. */
	let lastQuery = "";
	/** Snapshot-identity cache (spec 039). Invalidated when getStore() returns a new reference. */
	let lastSnapshot: StoreSnapshot | null = null;
	let cachedAllEntries: ReadonlyArray<PaletteEntry> = [];

	// --- Helpers ---
	function close(): void {
		open = false;
	}

	/**
	 * Returns the cached PaletteEntry list, rebuilding only when the snapshot
	 * reference has changed (spec 039 — snapshot-identity memoisation).
	 *
	 * Calls getStore() exactly once per invocation to read + compare the
	 * current snapshot reference. If the reference is unchanged, rebuilding
	 * is skipped and the cached list is returned in O(1).
	 */
	function resolveAllEntries(): ReadonlyArray<PaletteEntry> {
		const snapshot: StoreSnapshot = getStore
			? getStore()
			: { projects: [], files: [], activeProject: null };
		if (snapshot !== lastSnapshot) {
			lastSnapshot = snapshot;
			cachedAllEntries = buildEntries(snapshot);
		}
		return cachedAllEntries;
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
			lastQuery = query;
			const all = resolveAllEntries();
			return applyFuzzyFilter(all, query);
		},

		selectRowAt(index: number): void {
			// Reuse the cached entries from the last getEntries call — no getStore() call
			// (spec 039: selectRowAt must not call getStore independently when cache is warm).
			// Use the same filtered view that getEntries last returned so the
			// DOM-rendered index maps correctly even when a query is active.
			const filtered = applyFuzzyFilter(cachedAllEntries, lastQuery);
			const entry = filtered[index];
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
			cachedAllEntries = [];
		},
	};

	return handle;
}
