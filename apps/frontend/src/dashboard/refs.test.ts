import { describe, expect, it } from "bun:test";
import { buildRefEntries } from "./refs.ts";

describe("buildRefEntries", () => {
	it("merges a branch with a worktree of the same name into one entry", () => {
		const entries = buildRefEntries(
			[
				{ name: "main", current: true },
				{ name: "feat/x", current: false },
			],
			[
				{
					path: "/p/main",
					relPath: ".",
					branch: "main",
					head: "abc",
					isMain: true,
				},
				{
					path: "/p/wt-feat-x",
					relPath: "../wt-feat-x",
					branch: "feat/x",
					head: "def",
					isMain: false,
				},
			],
		);
		expect(entries).toHaveLength(2);
		const main = entries.find((e) => e.name === "main");
		expect(main?.branch?.current).toBe(true);
		expect(main?.worktree?.isMain).toBe(true);
		const fx = entries.find((e) => e.name === "feat/x");
		expect(fx?.branch).toBeDefined();
		expect(fx?.worktree?.relPath).toBe("../wt-feat-x");
	});

	it("creates a worktree-only entry when the branch was deleted", () => {
		const entries = buildRefEntries(
			[],
			[
				{
					path: "/p/wt-orphan",
					relPath: "wt-orphan",
					branch: "old-branch",
					head: "abc",
					isMain: false,
				},
			],
		);
		expect(entries).toHaveLength(1);
		expect(entries[0].name).toBe("old-branch");
		expect(entries[0].branch).toBeUndefined();
		expect(entries[0].worktree).toBeDefined();
	});

	it("places detached worktrees after named entries", () => {
		const entries = buildRefEntries(
			[{ name: "main", current: true }],
			[
				{
					path: "/p/detached",
					relPath: "detached",
					branch: null,
					head: "xyz",
					isMain: false,
				},
			],
		);
		expect(entries).toHaveLength(2);
		expect(entries[0].name).toBe("main");
		expect(entries[1].name).toContain("(detached)");
	});

	it("sorts main worktree first, then other worktrees, then current branch, then alpha", () => {
		const entries = buildRefEntries(
			[
				{ name: "alpha", current: false },
				{ name: "beta", current: true },
				{ name: "gamma", current: false },
				{ name: "main", current: false },
			],
			[
				{
					path: "/p/main",
					relPath: ".",
					branch: "main",
					head: "h",
					isMain: true,
				},
				{
					path: "/p/wt-gamma",
					relPath: "../wt-gamma",
					branch: "gamma",
					head: "h2",
					isMain: false,
				},
			],
		);
		expect(entries.map((e) => e.name)).toEqual(["main", "gamma", "beta", "alpha"]);
	});
});
