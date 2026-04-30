import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeProjectsServiceTest, ProjectsService } from "./projects.repo.ts";

describe("ProjectsService — Test layer", () => {
	it("returns provided fixtures sorted by lastModified desc", async () => {
		const layer = makeProjectsServiceTest([
			{ id: "a", name: "a", path: "/a", isGitRepo: true, lastModified: 100 },
			{ id: "b", name: "b", path: "/b", isGitRepo: false, lastModified: 300 },
			{ id: "c", name: "c", path: "/c", isGitRepo: true, lastModified: 200 },
		]);
		const program = Effect.gen(function* () {
			const svc = yield* ProjectsService;
			return yield* svc.list();
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result.map((p) => p.id)).toEqual(["b", "c", "a"]);
	});

	it("returns empty list when no fixtures", async () => {
		const layer = makeProjectsServiceTest([]);
		const program = Effect.gen(function* () {
			const svc = yield* ProjectsService;
			return yield* svc.list();
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toEqual([]);
	});
});
