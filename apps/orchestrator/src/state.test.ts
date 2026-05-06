import { describe, expect, test } from "bun:test";
import {
	FAILURE_BASE_DELAY_MS,
	FAILURE_MAX_BACKOFF_MS,
	failure_backoff,
	outcome_label,
	parse_slice_label,
	type SliceId,
	slice_label,
	type WorkerId,
	worker_label,
} from "./state.ts";

const sid = (s: string): SliceId => s as SliceId;
const wid = (s: string): WorkerId => s as WorkerId;

describe("slice_label", () => {
	test("formats as slice:<id>:<status>", () => {
		expect(slice_label(sid("a1"), "open")).toBe("slice:a1:open");
		expect(slice_label(sid("foo-bar"), "in-progress")).toBe("slice:foo-bar:in-progress");
		expect(slice_label(sid("z9"), "done")).toBe("slice:z9:done");
		expect(slice_label(sid("z9"), "failed")).toBe("slice:z9:failed");
	});
});

describe("parse_slice_label", () => {
	test("round-trips slice_label output for every state", () => {
		const ids = [sid("a"), sid("foo-bar"), sid("abc123"), sid("a".repeat(32))];
		const states = ["open", "in-progress", "done", "failed"] as const;
		for (const id of ids) {
			for (const status of states) {
				const round = parse_slice_label(slice_label(id, status));
				expect(round).not.toBeNull();
				expect(round?.id).toBe(id);
				expect(round?.status).toBe(status);
			}
		}
	});

	test("returns null for non-matching strings", () => {
		expect(parse_slice_label("")).toBeNull();
		expect(parse_slice_label("slice")).toBeNull();
		expect(parse_slice_label("slice:foo")).toBeNull();
		expect(parse_slice_label("slice:foo:bogus")).toBeNull();
		expect(parse_slice_label("notaslice:foo:open")).toBeNull();
		expect(parse_slice_label("slice:foo:open:extra")).toBeNull();
		expect(parse_slice_label("aligned")).toBeNull();
	});

	test("rejects ids that don't match [a-z0-9-]{1,32}", () => {
		expect(parse_slice_label("slice::open")).toBeNull();
		expect(parse_slice_label("slice:Foo:open")).toBeNull();
		expect(parse_slice_label("slice:foo_bar:open")).toBeNull();
		expect(parse_slice_label("slice:foo bar:open")).toBeNull();
		expect(parse_slice_label(`slice:${"a".repeat(33)}:open`)).toBeNull();
	});

	test("rejects unknown statuses", () => {
		expect(parse_slice_label("slice:foo:queued")).toBeNull();
		expect(parse_slice_label("slice:foo:OPEN")).toBeNull();
	});
});

describe("failure_backoff", () => {
	test("formula is base * 2^(attempt-1)", () => {
		expect(failure_backoff(1)).toBe(FAILURE_BASE_DELAY_MS);
		expect(failure_backoff(2)).toBe(FAILURE_BASE_DELAY_MS * 2);
		expect(failure_backoff(3)).toBe(FAILURE_BASE_DELAY_MS * 4);
		expect(failure_backoff(4)).toBe(FAILURE_BASE_DELAY_MS * 8);
	});

	test("caps at FAILURE_MAX_BACKOFF_MS at attempt=5,6,7", () => {
		// 10000 * 2^4 = 160000  (uncapped)
		// 10000 * 2^5 = 320000 -> capped to 300000
		// 10000 * 2^6 = 640000 -> capped to 300000
		expect(failure_backoff(5)).toBe(160_000);
		expect(failure_backoff(6)).toBe(FAILURE_MAX_BACKOFF_MS);
		expect(failure_backoff(7)).toBe(FAILURE_MAX_BACKOFF_MS);
		expect(failure_backoff(20)).toBe(FAILURE_MAX_BACKOFF_MS);
	});
});

describe("worker_label", () => {
	test("prefixes with worker:", () => {
		expect(worker_label(wid("w1"))).toBe("worker:w1");
		expect(worker_label(wid("alpha-beta"))).toBe("worker:alpha-beta");
	});
});

describe("outcome_label", () => {
	test("returns the outcome verbatim", () => {
		expect(outcome_label("done")).toBe("done");
		expect(outcome_label("rejected")).toBe("rejected");
		expect(outcome_label("failed")).toBe("failed");
		expect(outcome_label("stalled")).toBe("stalled");
	});
});
