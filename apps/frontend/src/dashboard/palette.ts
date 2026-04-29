/**
 * Double-shift command palette — spec 010.
 *
 * Exports a single `installPalette(deps) → PaletteHandle` factory.
 * All state-machine logic is pure (timestamps passed in, no Date.now() calls
 * inside the machine) so it is deterministic and testable without fake timers.
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
// ---------------------------------------------------------------------------
function applyFuzzyFilter(
	entries: ReadonlyArray<PaletteEntry>,
	query: string,
): ReadonlyArray<PaletteEntry> {
	if (!query) return entries;
	const q = query.toLowerCase();
	const matches: PaletteEntry[] = [];
	const others: PaletteEntry[] = [];
	for (const entry of entries) {
		if (entry.label.toLowerCase().includes(q)) {
			matches.push(entry);
		} else {
			others.push(entry);
		}
	}
	return [...matches, ...others].filter((e) => e.label.toLowerCase().includes(q));
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

	// --- Helpers ---
	function close(): void {
		open = false;
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
			const snapshot: StoreSnapshot = getStore
				? getStore()
				: { projects: [], files: [], activeProject: null };
			const all = buildEntries(snapshot);
			return applyFuzzyFilter(all, query);
		},

		selectRowAt(index: number): void {
			const snapshot: StoreSnapshot = getStore
				? getStore()
				: { projects: [], files: [], activeProject: null };
			const all = buildEntries(snapshot);
			// Use the same filtered view that getEntries last returned so the
			// DOM-rendered index maps correctly even when a query is active.
			const filtered = applyFuzzyFilter(all, lastQuery);
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
		},
	};

	return handle;
}
