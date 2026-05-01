import { describe, expect, test } from "bun:test";
import { Effect } from "effect";

// ---------------------------------------------------------------------------
// RED: drops.repo.ts does not exist yet. This import will fail at module load
// time, causing every test here to fail — that is the intended RED state.
// ---------------------------------------------------------------------------
type DropsRepoModule = {
	DropsService?: unknown;
	makeDropsServiceTest?: (root: string) => unknown;
};

const dropsRepoModule: DropsRepoModule = await import("./drops.repo.ts").catch(() => ({}));

describe("DropsService (integration)", () => {
	test("DropsService tag is exported", () => {
		// RED: module does not exist yet
		expect(dropsRepoModule.DropsService).toBeDefined();
	});

	test("makeDropsServiceTest saves a file and returns { name, path, size }", async () => {
		// RED: module does not exist yet
		expect(dropsRepoModule.makeDropsServiceTest).toBeDefined();
		if (!dropsRepoModule.makeDropsServiceTest) return;

		const tmpRoot = `/tmp/drops-test-${Date.now()}`;
		const svc = (
			dropsRepoModule.makeDropsServiceTest as (root: string) => {
				saveDropped: (args: {
					files: File[];
				}) => Effect.Effect<Array<{ name: string; path: string; size: number }>, never, never>;
				listDropped: () => Effect.Effect<
					Array<{ name: string; path: string; size: number; mtime: number }>,
					never,
					never
				>;
			}
		)(tmpRoot);

		const files = [new File(["hello"], "hello.txt")];
		const result = await Effect.runPromise(svc.saveDropped({ files }));
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(1);
		const entry = result[0];
		expect(typeof entry?.name).toBe("string");
		expect(typeof entry?.path).toBe("string");
		expect(typeof entry?.size).toBe("number");
		// Path must be absolute and contain /drops/
		expect(entry?.path.startsWith("/")).toBe(true);
		expect(entry?.path).toContain("/drops/");
	});

	test("makeDropsServiceTest listDropped returns entries sorted newest-first", async () => {
		// RED: module does not exist yet
		expect(dropsRepoModule.makeDropsServiceTest).toBeDefined();
		if (!dropsRepoModule.makeDropsServiceTest) return;

		const tmpRoot = `/tmp/drops-test-list-${Date.now()}`;
		const svc = (
			dropsRepoModule.makeDropsServiceTest as (root: string) => {
				saveDropped: (args: {
					files: File[];
				}) => Effect.Effect<Array<{ name: string; path: string; size: number }>, never, never>;
				listDropped: () => Effect.Effect<
					Array<{ name: string; path: string; size: number; mtime: number }>,
					never,
					never
				>;
			}
		)(tmpRoot);

		// Save two files (sequentially to get different mtimes)
		await Effect.runPromise(svc.saveDropped({ files: [new File(["a"], "a.txt")] }));
		await Effect.runPromise(svc.saveDropped({ files: [new File(["b"], "b.txt")] }));

		const listed = await Effect.runPromise(svc.listDropped());
		expect(Array.isArray(listed)).toBe(true);
		// Each entry must have required shape
		for (const entry of listed) {
			expect(typeof entry.name).toBe("string");
			expect(typeof entry.path).toBe("string");
			expect(typeof entry.size).toBe("number");
			expect(typeof entry.mtime).toBe("number");
		}
		// Sorted newest-first
		for (let i = 1; i < listed.length; i++) {
			const prev = listed[i - 1];
			const curr = listed[i];
			expect((prev?.mtime ?? 0) >= (curr?.mtime ?? 0)).toBe(true);
		}
	});
});
