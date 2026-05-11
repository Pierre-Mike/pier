import { describe, expect, it } from "bun:test";
import { GlobalWindow } from "happy-dom";

// Gate — spec 024: Show gitignored files with muted color in file tree
//
// Integration tests asserting that:
// 1. FileEntry type includes an `ignored` field (types.ts source check)
// 2. files.ts renders "tree-file--ignored" class for ignored entries
// 3. Non-ignored files do NOT receive the ignored class
//
// spec 041 update: DOM test removed store.fileFilter and store.files references
// (both fields deleted from DashboardState in spec 041). The renderFileTree DOM
// test now uses folderChildrenCache to seed entries.

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
		expect(typesSource).toContain("ignored");
	});
});

// ---------------------------------------------------------------------------
// AC5 + AC6: files.ts renders tree-file--ignored class for ignored entries
// ---------------------------------------------------------------------------
describe("renderFileTree — ignored class (spec 024 AC5+AC6)", () => {
	it("files.ts references tree-file--ignored CSS class", () => {
		expect(filesSource).toContain("tree-file--ignored");
	});

	it("files.ts conditionally applies ignored class based on file.ignored flag", () => {
		expect(filesSource).toContain("ignored");
		expect(filesSource).toContain("tree-file--ignored");
		const hasConditional =
			filesSource.includes("ignored ?") ||
			filesSource.includes("ignored?") ||
			filesSource.includes("f.ignored") ||
			filesSource.includes(".ignored");
		expect(hasConditional).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DOM-level: renderFileTree renders ignored class from folderChildrenCache
// spec 041 update: store.files removed; DOM test uses folderChildrenCache.
// ---------------------------------------------------------------------------
describe("renderFileTree DOM — ignored class applied correctly via cache (spec 024 AC5+AC6)", () => {
	it("ignored file from folderChildrenCache gets tree-file--ignored class", async () => {
		const mod = await import("./files.ts");

		// Set up DOM
		const host = document.createElement("div");
		host.id = "file-tree";
		document.body.appendChild(host);

		// Set up store — no files/fileFilter (spec 041: both removed)
		const { store } = await import("./state.ts");
		store.sessions.set("alpha-dom", { url: "" });
		store.activeProject = "alpha-dom";
		store.expandedDirs = new Set();

		// Seed folderChildrenCache with root-level entries (lazy-load path)
		const cache = (mod as unknown as Record<string, unknown>)["folderChildrenCache"] as
			| Map<string, unknown[]>
			| undefined;

		if (cache) {
			cache.set("", [
				{ path: "index.ts", isDir: false, ignored: false },
				{ path: "bundle.js", isDir: false, ignored: true },
			]);
		}

		// Call renderFileTree
		mod.renderFileTree();

		// Assert ignored entry has the class
		const ignoredItems = host.querySelectorAll(".tree-file--ignored");
		expect(ignoredItems.length).toBe(1);

		document.body.removeChild(host);
		if (cache) cache.clear();
	});
});

// ===========================================================================
// spec 040: Lazy-load file tree on expand and search
// ===========================================================================
//
// AC5: fetchFolderChildren(projectId, folderPath) is exported and caches results.
// AC6 (REMOVED in spec 041): fileFilter branch removed; search moved to palette.
// AC7: renderFileTree renders from folderChildrenCache.

describe("spec 040: files.ts exports lazy-load API (source-level AC5)", () => {
	it("files.ts exports fetchFolderChildren function", () => {
		expect(filesSource).toContain("fetchFolderChildren");
	});

	it("files.ts exports folderChildrenCache", () => {
		expect(filesSource).toContain("folderChildrenCache");
	});

	it("files.ts fetches from a prefix/folder endpoint", () => {
		const hasLazyFetch =
			filesSource.includes("fetchFolderChildren") &&
			(filesSource.includes("?prefix") ||
				filesSource.includes("prefix=") ||
				filesSource.includes("folderPath"));
		expect(hasLazyFetch).toBe(true);
	});
});

describe("spec 040: DOM — fetchFolderChildren and folderChildrenCache runtime presence (AC5)", () => {
	it("fetchFolderChildren is exported from files.ts module", async () => {
		const mod = await import("./files.ts");
		expect(typeof (mod as unknown as Record<string, unknown>)["fetchFolderChildren"]).toBe(
			"function",
		);
	});

	it("folderChildrenCache is exported from files.ts module", async () => {
		const mod = await import("./files.ts");
		const cache = (mod as unknown as Record<string, unknown>)["folderChildrenCache"];
		expect(cache).toBeDefined();
		expect(cache).toBeInstanceOf(Map);
	});
});

describe("spec 040: DOM — renderFileTree reads from folderChildrenCache (AC7)", () => {
	it("when folderChildrenCache has root entries, renderFileTree renders them", async () => {
		const mod = await import("./files.ts");
		const cache = (mod as unknown as Record<string, unknown>)["folderChildrenCache"] as
			| Map<string, unknown[]>
			| undefined;

		if (!cache) {
			expect(cache).toBeDefined();
			return;
		}

		// Set up DOM
		const host2 = document.createElement("div");
		const existingHost = document.getElementById("file-tree");
		if (existingHost) existingHost.id = "file-tree-bak";
		host2.id = "file-tree";
		document.body.appendChild(host2);

		const { store } = await import("./state.ts");
		store.sessions.set("beta-ac7", { url: "" });
		store.activeProject = "beta-ac7";

		cache.set("", [
			{ path: "README.md", isDir: false, ignored: false },
			{ path: "src", isDir: true, ignored: false },
		]);

		mod.renderFileTree();

		const placeholder = host2.querySelector(".placeholder");
		expect(placeholder).toBeNull();

		// Restore
		host2.id = "file-tree-ac7";
		if (existingHost) existingHost.id = "file-tree";
		document.body.removeChild(host2);
		cache.clear();
	});
});

// ===========================================================================
// spec 042: Wire palette-sidebar page composition
// ===========================================================================
//
// DOM-level: refreshFiles → renderFileTree wiring
// Asserts that after calling refreshFiles, the sidebar renders real tree
// entries (not just the empty placeholder div).

describe("spec 042: refreshFiles → renderFileTree wiring (DOM-level)", () => {
	it("calling refreshFiles populates #file-tree with real entries", async () => {
		const mod = await import("./files.ts");
		const { store } = await import("./state.ts");

		// Set up DOM
		const existingHost = document.getElementById("file-tree");
		if (existingHost) existingHost.id = "file-tree-bak-042";
		const host = document.createElement("div");
		host.id = "file-tree";
		document.body.appendChild(host);

		store.sessions.set("test-project-042", { url: "" });
		store.activeProject = "test-project-042";
		store.expandedDirs = new Set();

		// Patch globalThis.fetch so fetchFolderChildren returns real entries
		// biome-ignore lint/suspicious/noExplicitAny: test-only global patching
		const originalFetch = (globalThis as any).fetch;
		// biome-ignore lint/suspicious/noExplicitAny: test-only global patching
		(globalThis as any).fetch = async (_url: unknown) => ({
			ok: true,
			json: async () => ({
				files: [
					{ path: "README.md", isDir: false, ignored: false },
					{ path: "src", isDir: true, ignored: false },
				],
			}),
		});

		try {
			await mod.refreshFiles("test-project-042");
			const treeFiles = host.querySelectorAll(".tree-file");
			expect(treeFiles.length).toBeGreaterThan(0);
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: test-only global patching
			(globalThis as any).fetch = originalFetch;
			document.body.removeChild(host);
			if (existingHost) existingHost.id = "file-tree";
		}
	});
});
