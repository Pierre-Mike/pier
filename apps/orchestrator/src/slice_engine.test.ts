import { describe, expect, test } from "bun:test";
import type { Manifest, Slice } from "./manifest.ts";
import {
	derive_slice_states,
	parent_termination,
	ready_slices,
	slice_branch_for,
} from "./slice_engine.ts";
import { type SliceId, type SliceState, slice_label } from "./state.ts";

const sid = (s: string): SliceId => s as SliceId;

const make_slice = (id: string, deps: string[] = []): Slice => ({
	id: sid(id),
	title: `t-${id}`,
	deps: deps.map(sid),
	prompt_extra: "",
});

const make_manifest = (slices: Slice[]): Manifest => ({ slices });

const make_states = (entries: Array<[string, SliceState]>): ReadonlyMap<SliceId, SliceState> => {
	const m = new Map<SliceId, SliceState>();
	for (const [id, st] of entries) m.set(sid(id), st);
	return m;
};

describe("derive_slice_states", () => {
	test("extracts slice ids and states from a Set<string>", () => {
		const labels = new Set<string>([
			slice_label(sid("a"), "open"),
			slice_label(sid("b"), "in-progress"),
			slice_label(sid("c"), "done"),
			slice_label(sid("d"), "failed"),
		]);
		const out = derive_slice_states(labels);
		expect(out.size).toBe(4);
		expect(out.get(sid("a"))).toBe("open");
		expect(out.get(sid("b"))).toBe("in-progress");
		expect(out.get(sid("c"))).toBe("done");
		expect(out.get(sid("d"))).toBe("failed");
	});

	test("ignores non-slice labels", () => {
		const labels = new Set<string>([
			"aligned",
			"auto:local",
			"worker:w1",
			"in-progress",
			"slice:bogus:queued",
			slice_label(sid("a"), "open"),
		]);
		const out = derive_slice_states(labels);
		expect(out.size).toBe(1);
		expect(out.get(sid("a"))).toBe("open");
	});

	test("returns an empty map for empty label sets", () => {
		expect(derive_slice_states(new Set()).size).toBe(0);
	});
});

describe("ready_slices", () => {
	test("returns :open slices whose deps are all :done", () => {
		const m = make_manifest([make_slice("a"), make_slice("b", ["a"]), make_slice("c", ["b"])]);
		const states = make_states([
			["a", "done"],
			["b", "open"],
			["c", "open"],
		]);
		const ready = ready_slices(m, states);
		expect(ready.map((s) => s.id)).toEqual([sid("b")]);
	});

	test("excludes :in-progress, :done, :failed slices", () => {
		const m = make_manifest([
			make_slice("ip"),
			make_slice("dn"),
			make_slice("fl"),
			make_slice("op"),
		]);
		const states = make_states([
			["ip", "in-progress"],
			["dn", "done"],
			["fl", "failed"],
			["op", "open"],
		]);
		const ready = ready_slices(m, states);
		expect(ready.map((s) => s.id)).toEqual([sid("op")]);
	});

	test("excludes :open slices with any :open or :in-progress dep", () => {
		const m = make_manifest([
			make_slice("a"),
			make_slice("b"),
			make_slice("c", ["a", "b"]),
			make_slice("d", ["a"]),
		]);
		const states = make_states([
			["a", "in-progress"],
			["b", "done"],
			["c", "open"],
			["d", "open"],
		]);
		const ready = ready_slices(m, states);
		// c blocked by a (:in-progress); d blocked by a (:in-progress); a not :open
		expect(ready.map((s) => s.id)).toEqual([]);
	});

	test("excludes :open slices with an :open dep", () => {
		const m = make_manifest([make_slice("a"), make_slice("b", ["a"])]);
		const states = make_states([
			["a", "open"],
			["b", "open"],
		]);
		// b is blocked by a (:open); a is itself ready
		expect(ready_slices(m, states).map((s) => s.id)).toEqual([sid("a")]);
	});

	test("excludes :open slices whose dep is :failed", () => {
		const m = make_manifest([make_slice("a"), make_slice("b", ["a"])]);
		const states = make_states([
			["a", "failed"],
			["b", "open"],
		]);
		expect(ready_slices(m, states).map((s) => s.id)).toEqual([]);
	});

	test("treats missing dep state as not-done", () => {
		const m = make_manifest([make_slice("b", ["a"])]);
		const states = make_states([["b", "open"]]);
		expect(ready_slices(m, states).map((s) => s.id)).toEqual([]);
	});

	test("a leaf :open slice with no deps is ready", () => {
		const m = make_manifest([make_slice("solo")]);
		const states = make_states([["solo", "open"]]);
		expect(ready_slices(m, states).map((s) => s.id)).toEqual([sid("solo")]);
	});
});

describe("parent_termination", () => {
	test("all-done when every slice is :done", () => {
		const m = make_manifest([make_slice("a"), make_slice("b", ["a"])]);
		const states = make_states([
			["a", "done"],
			["b", "done"],
		]);
		expect(parent_termination(m, states)).toEqual({ _tag: "all-done" });
	});

	test("blocked-by-failed when there is a :failed AND no ready slices", () => {
		const m = make_manifest([make_slice("a"), make_slice("b", ["a"])]);
		const states = make_states([
			["a", "failed"],
			["b", "open"],
		]);
		const out = parent_termination(m, states);
		expect(out._tag).toBe("blocked-by-failed");
		if (out._tag === "blocked-by-failed") {
			expect(out.failed).toEqual([sid("a")]);
		}
	});

	test("in-progress when there is a :failed but ready slices still exist", () => {
		const m = make_manifest([make_slice("a"), make_slice("b"), make_slice("c", ["b"])]);
		const states = make_states([
			["a", "failed"],
			["b", "done"],
			["c", "open"],
		]);
		expect(parent_termination(m, states)).toEqual({ _tag: "in-progress" });
	});

	test("in-progress when slices remain :open or :in-progress with no failures", () => {
		const m = make_manifest([make_slice("a"), make_slice("b")]);
		const states = make_states([
			["a", "in-progress"],
			["b", "open"],
		]);
		expect(parent_termination(m, states)).toEqual({ _tag: "in-progress" });
	});

	test("in-progress for an empty manifest", () => {
		expect(parent_termination(make_manifest([]), make_states([]))).toEqual({
			_tag: "in-progress",
		});
	});
});

describe("slice_branch_for", () => {
	test("composes <parent_branch>/slice-<id>", () => {
		expect(slice_branch_for("feat/foo", sid("a1"))).toBe("feat/foo/slice-a1");
		expect(slice_branch_for("main", sid("xyz-9"))).toBe("main/slice-xyz-9");
	});
});
