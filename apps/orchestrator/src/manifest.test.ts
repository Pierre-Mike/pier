import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
	apply_revert,
	type DiffViolation,
	diff_manifests,
	MANIFEST_PATH,
	type Manifest,
	parse_manifest,
	read_manifest,
	type Slice,
	stringify_manifest,
	validate_diff,
} from "./manifest.ts";
import type { SliceId, SliceState } from "./state.ts";

const sid = (s: string): SliceId => s as SliceId;

interface SliceOverrides {
	readonly id: string;
	readonly title?: string;
	readonly deps?: ReadonlyArray<SliceId>;
	readonly prompt_extra?: string;
}

const slice = (overrides: SliceOverrides): Slice => ({
	id: sid(overrides.id),
	title: overrides.title ?? "Title",
	deps: overrides.deps ?? [],
	prompt_extra: overrides.prompt_extra ?? "",
});

describe("parse_manifest", () => {
	test("parses a well-formed manifest", () => {
		const yaml = `slices:
  - id: a
    title: First
    deps: []
    prompt_extra: extra
  - id: b
    title: Second
    deps: [a]
`;
		const m = parse_manifest(yaml);
		expect(m.slices.length).toBe(2);
		expect(m.slices[0]?.id).toBe(sid("a"));
		expect(m.slices[0]?.title).toBe("First");
		expect(m.slices[0]?.prompt_extra).toBe("extra");
		expect(m.slices[1]?.deps).toEqual([sid("a")]);
		expect(m.slices[1]?.prompt_extra).toBe("");
	});

	test("throws when slices array is missing", () => {
		expect(() => parse_manifest("foo: bar\n")).toThrow("missing slices array");
	});

	test("throws when top-level YAML is null", () => {
		expect(() => parse_manifest("")).toThrow("missing slices array");
	});

	test("throws on invalid id pattern", () => {
		const yaml = `slices:
  - id: BadID
    title: T
`;
		expect(() => parse_manifest(yaml)).toThrow(/invalid id/);
	});

	test("throws when title is missing", () => {
		const yaml = `slices:
  - id: a
    deps: []
`;
		expect(() => parse_manifest(yaml)).toThrow(/missing title/);
	});

	test("throws when title is empty string", () => {
		const yaml = `slices:
  - id: a
    title: ""
`;
		expect(() => parse_manifest(yaml)).toThrow(/missing title/);
	});

	test("throws when deps is wrong type", () => {
		const yaml = `slices:
  - id: a
    title: T
    deps: "not-an-array"
`;
		expect(() => parse_manifest(yaml)).toThrow(/deps must be string\[\]/);
	});

	test("throws when deps contains non-string", () => {
		const yaml = `slices:
  - id: a
    title: T
    deps: [1, 2]
`;
		expect(() => parse_manifest(yaml)).toThrow(/deps must be string\[\]/);
	});

	test("throws on duplicate ids", () => {
		const yaml = `slices:
  - id: a
    title: First
  - id: a
    title: Second
`;
		expect(() => parse_manifest(yaml)).toThrow(/duplicate slice id: a/);
	});

	test("throws when deps reference unknown id", () => {
		const yaml = `slices:
  - id: a
    title: T
    deps: [ghost]
`;
		expect(() => parse_manifest(yaml)).toThrow(/deps unknown: ghost/);
	});

	test("detects direct dep cycle a -> b -> a", () => {
		const yaml = `slices:
  - id: a
    title: A
    deps: [b]
  - id: b
    title: B
    deps: [a]
`;
		expect(() => parse_manifest(yaml)).toThrow(/dep cycle/);
	});

	test("detects self cycle a -> a", () => {
		const yaml = `slices:
  - id: a
    title: A
    deps: [a]
`;
		expect(() => parse_manifest(yaml)).toThrow(/dep cycle/);
	});

	test("accepts an empty slices array", () => {
		const m = parse_manifest("slices: []\n");
		expect(m.slices).toEqual([]);
	});
});

describe("read_manifest", () => {
	const make_tmp_worktree = (): string => mkdtempSync(join(tmpdir(), "manifest-test-"));

	test("returns null when manifest file is absent", async () => {
		const dir = make_tmp_worktree();
		try {
			const result = await Effect.runPromise(read_manifest(dir));
			expect(result).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns parsed manifest when file is present", async () => {
		const dir = make_tmp_worktree();
		try {
			const path = join(dir, MANIFEST_PATH);
			mkdirSync(join(dir, ".specs"), { recursive: true });
			writeFileSync(
				path,
				`slices:
  - id: a
    title: Hello
    deps: []
`,
			);
			const result = await Effect.runPromise(read_manifest(dir));
			expect(result).not.toBeNull();
			expect(result?.slices.length).toBe(1);
			expect(result?.slices[0]?.id).toBe(sid("a"));
			expect(result?.slices[0]?.title).toBe("Hello");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fails with ManifestError when manifest is invalid", async () => {
		const dir = make_tmp_worktree();
		try {
			mkdirSync(join(dir, ".specs"), { recursive: true });
			writeFileSync(join(dir, MANIFEST_PATH), "not: a-manifest\n");
			const exit = await Effect.runPromiseExit(read_manifest(dir));
			expect(exit._tag).toBe("Failure");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("diff_manifests", () => {
	test("detects added slices", () => {
		const before: Manifest = { slices: [slice({ id: "a" })] };
		const after: Manifest = { slices: [slice({ id: "a" }), slice({ id: "b" })] };
		const diff = diff_manifests(before, after);
		expect(diff.added.map((s) => s.id)).toEqual([sid("b")]);
		expect(diff.removed).toEqual([]);
		expect(diff.modified).toEqual([]);
	});

	test("detects removed slices", () => {
		const before: Manifest = { slices: [slice({ id: "a" }), slice({ id: "b" })] };
		const after: Manifest = { slices: [slice({ id: "a" })] };
		const diff = diff_manifests(before, after);
		expect(diff.removed).toEqual([sid("b")]);
		expect(diff.added).toEqual([]);
		expect(diff.modified).toEqual([]);
	});

	test("detects modified title", () => {
		const before: Manifest = { slices: [slice({ id: "a", title: "Old" })] };
		const after: Manifest = { slices: [slice({ id: "a", title: "New" })] };
		const diff = diff_manifests(before, after);
		expect(diff.modified).toEqual([{ id: sid("a"), fields: ["title"] }]);
	});

	test("detects modified prompt_extra", () => {
		const before: Manifest = { slices: [slice({ id: "a", prompt_extra: "x" })] };
		const after: Manifest = { slices: [slice({ id: "a", prompt_extra: "y" })] };
		const diff = diff_manifests(before, after);
		expect(diff.modified).toEqual([{ id: sid("a"), fields: ["prompt_extra"] }]);
	});

	test("detects modified deps (length change)", () => {
		const before: Manifest = {
			slices: [slice({ id: "a" }), slice({ id: "b", deps: [sid("a")] })],
		};
		const after: Manifest = {
			slices: [slice({ id: "a" }), slice({ id: "b", deps: [] })],
		};
		const diff = diff_manifests(before, after);
		expect(diff.modified).toEqual([{ id: sid("b"), fields: ["deps"] }]);
	});

	test("detects modified deps (order/value change at same length)", () => {
		const before: Manifest = {
			slices: [
				slice({ id: "a" }),
				slice({ id: "b" }),
				slice({ id: "c", deps: [sid("a"), sid("b")] }),
			],
		};
		const after: Manifest = {
			slices: [
				slice({ id: "a" }),
				slice({ id: "b" }),
				slice({ id: "c", deps: [sid("b"), sid("a")] }),
			],
		};
		const diff = diff_manifests(before, after);
		expect(diff.modified).toEqual([{ id: sid("c"), fields: ["deps"] }]);
	});

	test("returns empty diff when manifests are equal", () => {
		const m: Manifest = { slices: [slice({ id: "a", title: "T", deps: [] })] };
		const diff = diff_manifests(m, m);
		expect(diff.added).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.modified).toEqual([]);
	});

	test("captures multiple field changes for one slice", () => {
		const before: Manifest = {
			slices: [slice({ id: "a", title: "Old", prompt_extra: "x" })],
		};
		const after: Manifest = {
			slices: [slice({ id: "a", title: "New", prompt_extra: "y" })],
		};
		const diff = diff_manifests(before, after);
		expect(diff.modified.length).toBe(1);
		expect(diff.modified[0]?.fields).toEqual(["title", "prompt_extra"]);
	});
});

describe("validate_diff", () => {
	const empty_diff = { added: [], removed: [], modified: [] };

	test("no violations when current_states is empty", () => {
		const diff = {
			...empty_diff,
			modified: [{ id: sid("a"), fields: ["title" as const] }],
			removed: [sid("b")],
		};
		const v = validate_diff(diff, new Map());
		expect(v).toEqual([]);
	});

	test("no violations when state is open", () => {
		const diff = {
			...empty_diff,
			modified: [{ id: sid("a"), fields: ["title" as const] }],
			removed: [sid("b")],
		};
		const states = new Map<SliceId, SliceState>([
			[sid("a"), "open"],
			[sid("b"), "open"],
		]);
		expect(validate_diff(diff, states)).toEqual([]);
	});

	test("flags modified-locked when state is in-progress", () => {
		const diff = {
			...empty_diff,
			modified: [{ id: sid("a"), fields: ["title" as const] }],
		};
		const states = new Map<SliceId, SliceState>([[sid("a"), "in-progress"]]);
		const v = validate_diff(diff, states);
		expect(v).toEqual([{ kind: "modified-locked", id: sid("a"), state: "in-progress" }]);
	});

	test("flags removed-locked when state is done", () => {
		const diff = { ...empty_diff, removed: [sid("a")] };
		const states = new Map<SliceId, SliceState>([[sid("a"), "done"]]);
		const v = validate_diff(diff, states);
		expect(v).toEqual([{ kind: "removed-locked", id: sid("a"), state: "done" }]);
	});

	test("flags both modified and removed locked entries together", () => {
		const diff = {
			added: [],
			removed: [sid("b")],
			modified: [{ id: sid("a"), fields: ["title" as const] }],
		};
		const states = new Map<SliceId, SliceState>([
			[sid("a"), "failed"],
			[sid("b"), "in-progress"],
		]);
		const v = validate_diff(diff, states);
		expect(v.length).toBe(2);
		expect(v).toContainEqual({ kind: "modified-locked", id: sid("a"), state: "failed" });
		expect(v).toContainEqual({ kind: "removed-locked", id: sid("b"), state: "in-progress" });
	});

	test("ignores additions regardless of state", () => {
		const diff = { added: [slice({ id: "c" })], removed: [], modified: [] };
		const states = new Map<SliceId, SliceState>([[sid("c"), "in-progress"]]);
		expect(validate_diff(diff, states)).toEqual([]);
	});
});

describe("apply_revert", () => {
	test("returns current unchanged when violations is empty", () => {
		const current: Manifest = { slices: [slice({ id: "a", title: "X" })] };
		const last_seen: Manifest = { slices: [slice({ id: "a", title: "Y" })] };
		const out = apply_revert({ current, last_seen, violations: [] });
		expect(out).toBe(current);
	});

	test("restores a modified-locked slice from last_seen", () => {
		const last_seen: Manifest = {
			slices: [slice({ id: "a", title: "Original", prompt_extra: "orig" })],
		};
		const current: Manifest = {
			slices: [slice({ id: "a", title: "Tampered", prompt_extra: "bad" })],
		};
		const violations: DiffViolation[] = [
			{ kind: "modified-locked", id: sid("a"), state: "in-progress" },
		];
		const out = apply_revert({ current, last_seen, violations });
		expect(out.slices.length).toBe(1);
		expect(out.slices[0]?.title).toBe("Original");
		expect(out.slices[0]?.prompt_extra).toBe("orig");
	});

	test("restores a removed-locked slice back into the manifest", () => {
		const last_seen: Manifest = {
			slices: [slice({ id: "a", title: "Keep" }), slice({ id: "b", title: "Locked" })],
		};
		const current: Manifest = { slices: [slice({ id: "a", title: "Keep" })] };
		const violations: DiffViolation[] = [{ kind: "removed-locked", id: sid("b"), state: "done" }];
		const out = apply_revert({ current, last_seen, violations });
		const ids = out.slices.map((s) => s.id);
		expect(ids).toContain(sid("b"));
		expect(out.slices.find((s) => s.id === sid("b"))?.title).toBe("Locked");
	});

	test("preserves additions and edits to non-violated slices", () => {
		const last_seen: Manifest = {
			slices: [slice({ id: "a", title: "Locked-orig" }), slice({ id: "b", title: "Free-orig" })],
		};
		const current: Manifest = {
			slices: [
				slice({ id: "a", title: "Locked-tampered" }),
				slice({ id: "b", title: "Free-edited" }),
				slice({ id: "c", title: "Newly-added" }),
			],
		};
		const violations: DiffViolation[] = [
			{ kind: "modified-locked", id: sid("a"), state: "in-progress" },
		];
		const out = apply_revert({ current, last_seen, violations });
		const by_id = new Map(out.slices.map((s) => [s.id, s]));
		expect(by_id.get(sid("a"))?.title).toBe("Locked-orig");
		expect(by_id.get(sid("b"))?.title).toBe("Free-edited");
		expect(by_id.get(sid("c"))?.title).toBe("Newly-added");
	});

	test("preserves removals of non-violated slices", () => {
		const last_seen: Manifest = {
			slices: [slice({ id: "a" }), slice({ id: "b" }), slice({ id: "c" })],
		};
		const current: Manifest = { slices: [slice({ id: "a" })] };
		// only `c` is locked; `b` was a legitimate removal
		const violations: DiffViolation[] = [{ kind: "removed-locked", id: sid("c"), state: "done" }];
		const out = apply_revert({ current, last_seen, violations });
		const ids = out.slices.map((s) => s.id);
		expect(ids).toContain(sid("a"));
		expect(ids).toContain(sid("c"));
		expect(ids).not.toContain(sid("b"));
	});

	test("skips violations whose id is absent from last_seen", () => {
		const last_seen: Manifest = { slices: [slice({ id: "a" })] };
		const current: Manifest = { slices: [slice({ id: "a" })] };
		const violations: DiffViolation[] = [
			{ kind: "removed-locked", id: sid("ghost"), state: "done" },
		];
		const out = apply_revert({ current, last_seen, violations });
		expect(out.slices.map((s) => s.id)).toEqual([sid("a")]);
	});
});

describe("stringify_manifest", () => {
	test("round-trips through parse_manifest", () => {
		const original: Manifest = {
			slices: [
				slice({ id: "a", title: "First", deps: [], prompt_extra: "hello" }),
				slice({ id: "b", title: "Second", deps: [sid("a")], prompt_extra: "" }),
			],
		};
		const yaml = stringify_manifest(original);
		const reparsed = parse_manifest(yaml);
		expect(reparsed.slices.length).toBe(2);
		expect(reparsed.slices[0]?.id).toBe(sid("a"));
		expect(reparsed.slices[0]?.title).toBe("First");
		expect(reparsed.slices[0]?.prompt_extra).toBe("hello");
		expect(reparsed.slices[1]?.id).toBe(sid("b"));
		expect(reparsed.slices[1]?.deps).toEqual([sid("a")]);
		expect(reparsed.slices[1]?.prompt_extra).toBe("");
	});

	test("round-trips an empty manifest", () => {
		const original: Manifest = { slices: [] };
		const yaml = stringify_manifest(original);
		const reparsed = parse_manifest(yaml);
		expect(reparsed.slices).toEqual([]);
	});
});
