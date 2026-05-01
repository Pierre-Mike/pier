import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
	makeRefsServiceTest,
	parseBranches,
	parseWorktrees,
	RefsService,
} from "./projects.refs.repo.ts";

describe("parseBranches", () => {
	it("parses current and non-current branches", () => {
		const raw = "* main\n  feat/x\n  spec/y\n";
		expect(parseBranches(raw)).toEqual([
			{ name: "main", current: true },
			{ name: "feat/x", current: false },
			{ name: "spec/y", current: false },
		]);
	});

	it("pins current to the front and sorts the rest alphabetically", () => {
		const raw = "  zebra\n* delta\n  alpha\n  beta\n";
		expect(parseBranches(raw)).toEqual([
			{ name: "delta", current: true },
			{ name: "alpha", current: false },
			{ name: "beta", current: false },
			{ name: "zebra", current: false },
		]);
	});

	it("ignores detached HEAD pseudo-branches", () => {
		const raw = "* (HEAD detached at abcd123)\n  main\n  feat/x\n";
		expect(parseBranches(raw)).toEqual([
			{ name: "feat/x", current: false },
			{ name: "main", current: false },
		]);
	});

	it("returns empty array for empty input", () => {
		expect(parseBranches("")).toEqual([]);
	});
});

describe("parseWorktrees", () => {
	const root = "/repo/proj";

	it("parses a single main worktree on a branch", () => {
		const raw = ["worktree /repo/proj", "HEAD abc123", "branch refs/heads/main", ""].join("\n");
		expect(parseWorktrees(raw, root)).toEqual([
			{ path: "/repo/proj", relPath: ".", branch: "main", head: "abc123", isMain: true },
		]);
	});

	it("parses multiple worktrees and pins main first", () => {
		const raw = [
			"worktree /repo/proj",
			"HEAD aaa",
			"branch refs/heads/main",
			"",
			"worktree /repo/proj/.wt/b",
			"HEAD bbb",
			"branch refs/heads/feat/b",
			"",
			"worktree /repo/proj/.wt/a",
			"HEAD ccc",
			"branch refs/heads/feat/a",
			"",
		].join("\n");
		const out = parseWorktrees(raw, root);
		expect(out.map((w) => w.relPath)).toEqual([".", ".wt/a", ".wt/b"]);
		expect(out[0].isMain).toBe(true);
		expect(out[1].isMain).toBe(false);
		expect(out[2].isMain).toBe(false);
		expect(out[1].branch).toBe("feat/a");
		expect(out[2].branch).toBe("feat/b");
	});

	it("handles detached HEAD worktrees", () => {
		const raw = [
			"worktree /repo/proj",
			"HEAD aaa",
			"branch refs/heads/main",
			"",
			"worktree /repo/proj/.wt/det",
			"HEAD dead",
			"detached",
			"",
		].join("\n");
		const out = parseWorktrees(raw, root);
		expect(out).toEqual([
			{ path: "/repo/proj", relPath: ".", branch: "main", head: "aaa", isMain: true },
			{
				path: "/repo/proj/.wt/det",
				relPath: ".wt/det",
				branch: null,
				head: "dead",
				isMain: false,
			},
		]);
	});

	it("returns absolute path when worktree lives outside the project root", () => {
		const raw = [
			"worktree /repo/proj",
			"HEAD aaa",
			"branch refs/heads/main",
			"",
			"worktree /elsewhere/wt",
			"HEAD bbb",
			"branch refs/heads/feat/x",
			"",
		].join("\n");
		const out = parseWorktrees(raw, root);
		expect(out[1].relPath).toBe("/elsewhere/wt");
	});

	it("handles bare repos (no branch line)", () => {
		const raw = ["worktree /repo/proj.git", "HEAD 0000000", "bare", ""].join("\n");
		const out = parseWorktrees(raw, "/repo/proj.git");
		expect(out).toEqual([
			{
				path: "/repo/proj.git",
				relPath: ".",
				branch: null,
				head: "0000000",
				isMain: true,
			},
		]);
	});

	it("returns empty array for empty input", () => {
		expect(parseWorktrees("", root)).toEqual([]);
	});
});

describe("RefsService — Test layer", () => {
	it("returns provided fixtures by project id", async () => {
		const layer = makeRefsServiceTest(
			new Map([
				[
					"p1",
					{
						branches: [{ name: "main", current: true }],
						worktrees: [
							{
								path: "/p1",
								relPath: ".",
								branch: "main",
								head: "abc",
								isMain: true,
							},
						],
					},
				],
			]),
		);
		const program = Effect.gen(function* () {
			const svc = yield* RefsService;
			return yield* svc.listRefs("p1");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result.branches.length).toBe(1);
		expect(result.worktrees.length).toBe(1);
	});

	it("returns empty refs for unknown project", async () => {
		const layer = makeRefsServiceTest(new Map());
		const program = Effect.gen(function* () {
			const svc = yield* RefsService;
			return yield* svc.listRefs("nope");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toEqual({ branches: [], worktrees: [] });
	});
});
