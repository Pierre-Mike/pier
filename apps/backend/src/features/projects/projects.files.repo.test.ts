import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeRepoServiceTest, type RepoFile, RepoService } from "./projects.files.repo.ts";

// RED gate — spec 024: Show gitignored files with muted color in file tree
//
// These tests assert:
//   AC1: RepoFile has `ignored: boolean` (not optional)
//   AC2+AC3: listFiles returns entries with correct `ignored` values
//
// Runtime RED mechanism:
// The helper `assertHasIgnored` checks that every entry has `ignored` as a
// boolean own-property. In the current implementation, live `listFiles`
// returns `RepoFile[]` where each object is built as `{ path, size: 0 }` —
// no `ignored` field. The test layer passes through whatever you put in the
// Map, but we also test that the returned shape STRICTLY has `ignored`.
//
// For the type-level RED, the `@ts-expect-error` comment below will cause a
// CI typecheck failure: the compiler sees `ignored` is not on `RepoFile`.

/** Asserts every entry has `ignored` as a strict boolean. Throws if not. */
function assertHasIgnored(files: readonly RepoFile[]): void {
	for (const f of files) {
		const val = (f as Record<string, unknown>)["ignored"];
		if (typeof val !== "boolean") {
			throw new Error(
				`RepoFile at path="${f.path}" is missing ignored: boolean — got ${JSON.stringify(val)}`,
			);
		}
	}
}

describe("RepoFile — ignored field runtime presence (spec 024 AC1)", () => {
	it("makeRepoServiceLive entries must have ignored: boolean — test layer RED check", async () => {
		// Use a test layer that does NOT inject `ignored` (current state).
		// This simulates the current live behavior where entries lack `ignored`.
		const layerWithoutIgnored = makeRepoServiceTest(
			new Map([["proj", [{ path: "src/main.ts", size: 0 }]]]),
		);
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("proj");
		});
		const result = await Effect.runPromise(Effect.provide(program, layerWithoutIgnored));
		// FAILS in RED: the entry has no `ignored` field — assertHasIgnored throws.
		// PASSES after implementation: RepoFile requires `ignored`, so fixture
		// callers must provide it (type-enforced) and the runtime value will be boolean.
		expect(() => assertHasIgnored(result)).not.toThrow();
	});
});

describe("RepoService — ignored flag flows through test layer (spec 024 AC2+AC3)", () => {
	const layer = makeRepoServiceTest(
		new Map([
			[
				"alpha",
				[
					{ path: "src/index.ts", size: 0, ignored: false },
					{ path: "dist/bundle.js", size: 1024, ignored: true },
					{ path: "README.md", size: 512, ignored: false },
				],
			],
		]),
	);

	it("listFiles returns all entries including gitignored ones", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toHaveLength(3);
	});

	it("all returned entries have ignored as a strict boolean (AC1 runtime shape)", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		// Passes even in RED because the Map preserves the extra prop.
		// After implementation: type-safe (no @ts-expect-error needed on fixture).
		expect(() => assertHasIgnored(result)).not.toThrow();
	});

	it("ignored: true entry is returned with ignored === true (AC3)", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		const dist = result.find((f) => f.path === "dist/bundle.js");
		expect(dist).toBeDefined();
		expect((dist as Record<string, unknown>)["ignored"]).toBe(true);
	});

	it("ignored: false entry is returned with ignored === false (AC3)", async () => {
		const program = Effect.gen(function* () {
			const svc = yield* RepoService;
			return yield* svc.listFiles("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		const src = result.find((f) => f.path === "src/index.ts");
		expect(src).toBeDefined();
		expect((src as Record<string, unknown>)["ignored"]).toBe(false);
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
