import { Effect } from "effect";
import { GhAdapterTag } from "./gh-adapter.ts";
import {
	ALIGNED_LABEL,
	type Backend,
	CONTINUATION_DELAY_MS,
	failure_backoff,
	type IssueRef,
	type OrchestratorState,
	ROUTING_LABEL,
} from "./state.ts";

export interface DispatchConfig {
	readonly backend: Backend;
	readonly poll_interval_ms: number;
	readonly max_concurrent: number;
	readonly stall_timeout_ms: number;
}

export const dispatch_gate_ok = (args: {
	readonly state: OrchestratorState;
	readonly issue: IssueRef;
	readonly max_concurrent: number;
	readonly active_workers: number;
}): boolean => {
	const { state, issue, max_concurrent, active_workers } = args;
	if (state.running.has(issue.id)) return false;
	if (active_workers >= max_concurrent) return false;
	return true;
};

export const eligible_for_dispatch = (issue: IssueRef, backend: Backend): boolean =>
	issue.state === "open" &&
	issue.labels.has(ALIGNED_LABEL) &&
	issue.labels.has(ROUTING_LABEL[backend]);

export const continuation_delay = () => CONTINUATION_DELAY_MS;
export const failure_delay = (attempt: number) => failure_backoff(attempt);

export const poll_tick = (cfg: DispatchConfig) =>
	Effect.gen(function* () {
		const gh = yield* GhAdapterTag;
		const candidates = yield* gh.fetch_candidates({
			aligned: true,
			routing: ROUTING_LABEL[cfg.backend],
		});
		return candidates.filter((i) => eligible_for_dispatch(i, cfg.backend));
	});
