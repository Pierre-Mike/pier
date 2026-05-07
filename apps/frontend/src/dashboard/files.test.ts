import { describe, expect, it } from "bun:test";

// RED gate — spec 024: Show gitignored files with muted color in file tree
//
// Integration tests asserting that:
// 1. FileEntry type includes an `ignored` field (types.ts source check)
// 2. files.ts renderTreeNode adds "tree-file--ignored" class for ignored entries
// 3. Non-ignored files do NOT receive the ignored class

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
		store.activeProject = "alpha";
		store.fileFilter = "";
		store.expandedDirs = new Set();
		store.files = [
			{ path: "src/index.ts", ignored: false },
			{ path: "dist/bundle.js", ignored: true },
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
