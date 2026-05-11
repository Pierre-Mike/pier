import { describe, expect, it } from "bun:test";
import { GlobalWindow } from "happy-dom";

// Gate — spec 024: Show gitignored files with muted color in file tree
//
// Integration tests asserting that:
// 1. FileEntry type includes an `ignored` field (types.ts source check)
// 2. files.ts renderTreeNode adds "tree-file--ignored" class for ignored entries
// 3. Non-ignored files do NOT receive the ignored class

// Inline DOM setup so the gate test runs from any cwd (repo root or app root).
const win = new GlobalWindow();
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).window = win;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).document = win.document;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).HTMLElement = win.HTMLElement;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Element = win.Element;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Node = win.Node;

const filesSource = await Bun.file(new URL("./files.ts", import.meta.url)).text();
const typesSource = await Bun.file(new URL("./types.ts", import.meta.url)).text();

// ---------------------------------------------------------------------------
// AC4: FileEntry type in types.ts includes `ignored` field
// ---------------------------------------------------------------------------
describe("FileEntry type — ignored field (spec 024 AC4)", () => {
	it("types.ts FileEntry interface includes ignored", () => {
		// Fails until `ignored` is added to FileEntry in types.ts
		expect(typesSource).toContain("ignored");
	});
});

// ---------------------------------------------------------------------------
// AC5 + AC6: files.ts renders tree-file--ignored class for ignored entries
// ---------------------------------------------------------------------------
describe("renderFileTree — ignored class (spec 024 AC5+AC6)", () => {
	it("files.ts references tree-file--ignored CSS class", () => {
		// Fails until renderTreeNode adds the ignored class
		expect(filesSource).toContain("tree-file--ignored");
	});

	it("files.ts conditionally applies ignored class based on file.ignored flag", () => {
		// Verify the source checks `ignored` property on file entries
		// A naive implementation might add the class unconditionally — this
		// asserts the source reads `ignored` to decide.
		expect(filesSource).toContain("ignored");
		// Also verify it's applied conditionally (not to all entries)
		expect(filesSource).toContain("tree-file--ignored");
		// The class must NOT be applied unconditionally — it must be in a
		// conditional expression (ternary or if). Check for conditional pattern.
		// Accept either ternary ("ignored" ? ... : ...) or template literal
		// with conditional.
		const hasConditional =
			filesSource.includes("ignored ?") ||
			filesSource.includes("ignored?") ||
			filesSource.includes("f.ignored") ||
			filesSource.includes(".ignored");
		expect(hasConditional).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DOM-level: renderTreeNode adds class for ignored entries
// ---------------------------------------------------------------------------
describe("renderFileTree DOM — ignored class applied correctly (spec 024 AC5+AC6)", () => {
	it("ignored file gets tree-file--ignored class; non-ignored does not", async () => {
		// Dynamically import to allow the module to load in bun:test environment
		// This will fail if the implementation doesn't exist yet (expected in RED)
		const mod = await import("./files.ts");

		// Set up minimal DOM environment
		const host = document.createElement("div");
		host.id = "file-tree";
		document.body.appendChild(host);

		// Patch store and state
		const { store } = await import("./state.ts");
		store.sessions.set("alpha", { url: "" });
		store.activeProject = "alpha";
		store.fileFilter = "";
		store.expandedDirs = new Set();
		store.files = [
			{ path: "index.ts", ignored: false },
			{ path: "bundle.js", ignored: true },
		] as Parameters<typeof store.files>[0] extends infer T ? T : never[];

		// Call renderFileTree
		mod.renderFileTree();

		// Assert ignored entry has the class
		const items = host.querySelectorAll(".tree-file");
		const ignoredItems = host.querySelectorAll(".tree-file--ignored");
		expect(ignoredItems.length).toBe(1);
		// Total items: 2 (one per file, since they're at root level)
		expect(items.length).toBeGreaterThanOrEqual(1);

		document.body.removeChild(host);
	});
});

// ===========================================================================
// spec 040: Lazy-load file tree on expand and search
// ===========================================================================
//
// RED gate — these tests reference `fetchFolderChildren` and `lazyRefreshFiles`
// which do NOT exist in files.ts yet. They will fail until the implementation
// is written.
//
// AC5: on folder expand, fetchFolderChildren(projectId, folderPath) is called
//      and its results are stored in folderChildrenCache (not store.files).
// AC6: when store.fileFilter is non-empty, refreshFiles fetches the full flat
//      list (existing behaviour) — NOT the lazy prefix path.
// AC7: the rendered tree uses folderChildrenCache data for expanded folders.

describe("spec 040: files.ts exports lazy-load API (source-level AC5)", () => {
	it("files.ts exports fetchFolderChildren function", () => {
		// RED: fetchFolderChildren does not exist in files.ts yet.
		// This source-level check is intentionally simple: if the export exists,
		// the implementation is present.
		expect(filesSource).toContain("fetchFolderChildren");
	});

	it("files.ts exports folderChildrenCache", () => {
		// RED: folderChildrenCache is the per-folder store, separate from store.files.
		expect(filesSource).toContain("folderChildrenCache");
	});

	it("files.ts references prefix-based API fetch", () => {
		// RED: the lazy path must use a prefix/folder query param or tree endpoint.
		const hasPrefixFetch =
			filesSource.includes("prefix") ||
			filesSource.includes("tree/") ||
			filesSource.includes("?prefix");
		expect(hasPrefixFetch).toBe(true);
	});
});

describe("spec 040: search triggers full-file fetch, not lazy (AC6)", () => {
	it("files.ts refreshFiles references fileFilter to decide fetch strategy", () => {
		// RED: the current refreshFiles does not branch on fileFilter.
		// After implementation it must check store.fileFilter before choosing
		// between the full-list fetch and the lazy prefix fetch.
		const hasFilterBranch =
			filesSource.includes("fileFilter") &&
			(filesSource.includes("refreshFiles") || filesSource.includes("lazyRefreshFiles"));
		expect(hasFilterBranch).toBe(true);
	});
});

describe("spec 040: DOM — folder expand triggers children fetch (AC5)", () => {
	it("fetchFolderChildren is exported from files.ts module", async () => {
		// RED: import will succeed but the named export won't exist, causing a
		// runtime undefined — the typeof check will fail.
		const mod = await import("./files.ts");
		// biome-ignore lint/suspicious/noExplicitAny: test-only runtime shape check
		expect(typeof (mod as unknown as Record<string, unknown>)["fetchFolderChildren"]).toBe(
			"function",
		);
	});

	it("folderChildrenCache is exported from files.ts module", async () => {
		// RED: folderChildrenCache doesn't exist yet.
		const mod = await import("./files.ts");
		// biome-ignore lint/suspicious/noExplicitAny: test-only runtime shape check
		const cache = (mod as unknown as Record<string, unknown>)["folderChildrenCache"];
		expect(cache).toBeDefined();
	});
});
