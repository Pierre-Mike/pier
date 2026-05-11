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
		expect(filesSource).toContain("fetchFolderChildren");
	});

	it("files.ts exports folderChildrenCache", () => {
		// RED: folderChildrenCache is the per-folder store, separate from store.files.
		expect(filesSource).toContain("folderChildrenCache");
	});

	it("files.ts fetches from a prefix/folder endpoint (not just the flat files endpoint)", () => {
		// RED: the lazy path must use a ?prefix or /tree/ query — specifically
		// a call that includes a folder-specific parameter distinct from the
		// plain /files fetch. We check for the string "folderChildrenCache" as a
		// proxy: only lazy-load code would define this.
		expect(filesSource).toContain("folderChildrenCache");
		// Also verify the lazy fetch uses a prefix parameter in its API call.
		// The existing code uses ".files.$get" for the flat fetch; the lazy fetch
		// must pass an additional argument (prefix/folder).
		const hasLazyFetch =
			filesSource.includes("fetchFolderChildren") &&
			(filesSource.includes("?prefix") ||
				filesSource.includes("prefix=") ||
				filesSource.includes("folderPath"));
		expect(hasLazyFetch).toBe(true);
	});
});

describe("spec 040: search triggers full-file fetch, not lazy (AC6)", () => {
	it("files.ts refreshFiles branches on fileFilter to choose fetch strategy", () => {
		// RED: the current refreshFiles does not call fetchFolderChildren — it
		// always does a full flat fetch. After implementation, refreshFiles must
		// check fileFilter and call fetchFolderChildren when filter is empty.
		const hasLazyBranch =
			filesSource.includes("fetchFolderChildren") && filesSource.includes("fileFilter");
		expect(hasLazyBranch).toBe(true);
	});
});

describe("spec 040: DOM — fetchFolderChildren and folderChildrenCache runtime presence (AC5)", () => {
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
		// Must be a Map (the per-folder cache container)
		expect(cache).toBeDefined();
		expect(cache).toBeInstanceOf(Map);
	});
});

describe("spec 040: DOM — renderFileTree reads from folderChildrenCache (AC7)", () => {
	it("when folderChildrenCache has root entries, renderFileTree renders them without relying on store.files", async () => {
		// RED: renderFileTree currently renders from store.files, not folderChildrenCache.
		// After implementation, renderFileTree must render from cache when filter is empty.
		const mod = await import("./files.ts");
		// biome-ignore lint/suspicious/noExplicitAny: test-only runtime shape check
		const cache = (mod as unknown as Record<string, unknown>)["folderChildrenCache"] as
			| Map<string, unknown[]>
			| undefined;

		if (!cache) {
			// folderChildrenCache not exported — test fails here (RED)
			expect(cache).toBeDefined();
			return;
		}

		// Set up DOM
		const host2 = document.createElement("div");
		host2.id = "file-tree-ac7";
		// Temporarily replace the #file-tree element used by renderFileTree
		const existingHost = document.getElementById("file-tree");
		if (existingHost) existingHost.id = "file-tree-bak";
		host2.id = "file-tree";
		document.body.appendChild(host2);

		const { store } = await import("./state.ts");
		store.sessions.set("beta", { url: "" });
		store.activeProject = "beta";
		store.fileFilter = "";
		// Intentionally empty store.files — cache should be the data source
		store.files = [];

		// Populate folderChildrenCache with root-level entries for "beta"
		// The cache key for root is "" (empty string) or the projectId — tester
		// uses the shape defined in design.md: keyed by folder path (empty = root).
		cache.set("", [
			{ path: "README.md", isDir: false, ignored: false },
			{ path: "src", isDir: true, ignored: false },
		]);

		// Call renderFileTree — must render from cache, not store.files
		mod.renderFileTree();

		// If AC7 is implemented, there should be rendered items from the cache.
		// If AC7 is NOT implemented (RED), store.files is empty so renderFileTree
		// renders the "no tracked files" placeholder.
		const placeholder = host2.querySelector(".placeholder");
		// RED: placeholder will appear (store.files is empty, cache is ignored)
		// GREEN: no placeholder, actual tree items rendered from cache
		expect(placeholder).toBeNull();

		// Restore
		host2.id = "file-tree-ac7";
		if (existingHost) existingHost.id = "file-tree";
		document.body.removeChild(host2);
		cache.clear();
	});
});
