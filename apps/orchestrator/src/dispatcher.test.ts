import { describe, expect, test } from "bun:test";
import { dispatch_gate_ok, eligible_for_dispatch } from "./dispatcher.ts";
import {
	ALIGNED_LABEL,
	type IssueId,
	type IssueRef,
	type OrchestratorState,
	ROUTING_LABEL,
	type RunningEntry,
} from "./state.ts";

const iid = (s: string): IssueId => s as IssueId;

const make_issue = (overrides: Partial<IssueRef> = {}): IssueRef => ({
	id: iid("issue-1"),
	identifier: "ORG-1",
	title: "test",
	state: "open",
	labels: new Set<string>([ALIGNED_LABEL, ROUTING_LABEL.local]),
	...overrides,
});

const empty_state = (): OrchestratorState => ({
	running: new Map(),
	claimed: new Set(),
	retry_queue: new Map(),
});

const running_state = (id: IssueId): OrchestratorState => {
	const entry: RunningEntry = {
		issue_id: id,
		identifier: "ORG-1",
		worker_id: "w1" as RunningEntry["worker_id"],
		session_id: "s-1",
		worker_pid: 1234,
		last_event: null,
		last_event_at: null,
		input_tokens: 0,
		output_tokens: 0,
		total_tokens: 0,
		started_at: 0,
		retry_attempt: 0,
		phase: "PreparingWorkspace",
	};
	return {
		running: new Map([[id, entry]]),
		claimed: new Set(),
		retry_queue: new Map(),
	};
};

describe("dispatch_gate_ok", () => {
	test("false when issue.id is already in state.running", () => {
		const issue = make_issue();
		const state = running_state(issue.id);
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 4, active_workers: 0 })).toBe(false);
	});

	test("false when active_workers >= max_concurrent", () => {
		const issue = make_issue();
		const state = empty_state();
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 2, active_workers: 2 })).toBe(false);
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 2, active_workers: 3 })).toBe(false);
	});

	test("true when neither block applies", () => {
		const issue = make_issue();
		const state = empty_state();
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 4, active_workers: 0 })).toBe(true);
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 4, active_workers: 3 })).toBe(true);
	});

	test("running gate takes priority over slot gate", () => {
		const issue = make_issue();
		const state = running_state(issue.id);
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 1, active_workers: 5 })).toBe(false);
	});

	test("running gate keys on issue id, not other entries", () => {
		const issue = make_issue({ id: iid("issue-2") });
		const state = running_state(iid("issue-1"));
		expect(dispatch_gate_ok({ state, issue, max_concurrent: 4, active_workers: 0 })).toBe(true);
	});
});

describe("eligible_for_dispatch", () => {
	test("requires open + aligned + correct routing label", () => {
		const issue = make_issue();
		expect(eligible_for_dispatch(issue, "local")).toBe(true);
	});

	test("rejects closed issues", () => {
		const issue = make_issue({ state: "closed" });
		expect(eligible_for_dispatch(issue, "local")).toBe(false);
	});

	test("rejects issues without aligned label", () => {
		const issue = make_issue({ labels: new Set([ROUTING_LABEL.local]) });
		expect(eligible_for_dispatch(issue, "local")).toBe(false);
	});

	test("rejects issues without the matching routing label", () => {
		const local_only = make_issue({
			labels: new Set([ALIGNED_LABEL, ROUTING_LABEL.local]),
		});
		expect(eligible_for_dispatch(local_only, "cloud")).toBe(false);

		const cloud_only = make_issue({
			labels: new Set([ALIGNED_LABEL, ROUTING_LABEL.cloud]),
		});
		expect(eligible_for_dispatch(cloud_only, "local")).toBe(false);
		expect(eligible_for_dispatch(cloud_only, "cloud")).toBe(true);
	});

	test("rejects issues with no labels", () => {
		const issue = make_issue({ labels: new Set() });
		expect(eligible_for_dispatch(issue, "local")).toBe(false);
	});
});
