import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeRepoServiceTest, RepoService } from "./projects.files.repo.ts";

describe("RepoService — Test layer", () => {
	const layer = makeRepoServiceTest(
		new Map([
			[
				"alpha",
				[
					{ path: "src/index.ts", size: 0 },
					{ path: "README.md", size: 0 },
				],
			],
		]),
	);

	it("returns fixture files for known project", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toHaveLength(2);
		expect(result[0]?.path).toBe("src/index.ts");
	});

	it("returns empty list for unknown project", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("bogus");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toEqual([]);
	});

	it("resolvePath returns deterministic test path", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.resolvePath({ projectId: "alpha", path: "src/x.ts" });
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toBe("/test/alpha/src/x.ts");
	});

	it("fileStat returns { size: 0 } in test layer", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.fileStat("/any/path.txt");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toEqual({ size: 0 });
	});
});
