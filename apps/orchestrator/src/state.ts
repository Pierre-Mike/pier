import { Data } from "effect";

export type Backend = "local" | "cloud";
export type Engine = "claude" | "openai" | "kata";

export type IssueId = string & { readonly _tag: "IssueId" };
export type WorkerId = string & { readonly _tag: "WorkerId" };
export type SessionId = `${string}-${string}`;

export type ClaimState = "Unclaimed" | "Claimed" | "Released";
export type ClaimedSubstate = "Running" | "RetryQueued";

export type AttemptPhase =
	| "PreparingWorkspace"
	| "BuildingPrompt"
	| "LaunchingAgentProcess"
	| "InitializingSession"
	| "StreamingTurn"
	| "Finishing"
	| "Succeeded"
	| "Failed"
	| "TimedOut"
	| "Stalled"
	| "CanceledByReconciliation";

export type Outcome = "done" | "rejected" | "failed" | "stalled";

export interface IssueRef {
	readonly id: IssueId;
	readonly identifier: string;
	readonly title: string;
	readonly state: "open" | "closed";
	readonly labels: ReadonlySet<string>;
}

export interface RunningEntry {
	readonly issue_id: IssueId;
	readonly identifier: string;
	readonly worker_id: WorkerId;
	readonly session_id: SessionId;
	readonly worker_pid: number;
	readonly last_event: string | null;
	readonly last_event_at: number | null;
	readonly input_tokens: number;
	readonly output_tokens: number;
	readonly total_tokens: number;
	readonly started_at: number;
	readonly retry_attempt: number;
	readonly phase: AttemptPhase;
}

export interface RetryEntry {
	readonly issue_id: IssueId;
	readonly identifier: string;
	readonly attempt: number;
	readonly due_at_ms: number;
	readonly timer_handle: NodeJS.Timeout | null;
	readonly error: string | null;
	readonly kind: "continuation" | "failure";
}

export interface OrchestratorState {
	readonly running: ReadonlyMap<IssueId, RunningEntry>;
	readonly claimed: ReadonlySet<IssueId>;
	readonly retry_queue: ReadonlyMap<IssueId, RetryEntry>;
}

export class DispatchBlocked extends Data.TaggedError("DispatchBlocked")<{
	readonly reason: "already-running" | "already-claimed" | "no-slots" | "blocked-by-deps";
	readonly issue: IssueId;
}> {}

export class StaleClaim extends Data.TaggedError("StaleClaim")<{
	readonly issue: IssueId;
}> {}

export const CONTINUATION_DELAY_MS = 1_000;
export const FAILURE_BASE_DELAY_MS = 10_000;
export const FAILURE_MAX_BACKOFF_MS = 300_000;

export const failure_backoff = (attempt: number): number =>
	Math.min(FAILURE_BASE_DELAY_MS * 2 ** (attempt - 1), FAILURE_MAX_BACKOFF_MS);

export const ROUTING_LABEL = {
	local: "auto:local",
	cloud: "auto:cloud",
} as const satisfies Record<Backend, string>;
export type RoutingLabel = (typeof ROUTING_LABEL)[Backend];

export const ALIGNED_LABEL = "aligned";
export const IN_PROGRESS_LABEL = "in-progress";
export const worker_label = (id: WorkerId) => `worker:${id}`;

export type SliceId = string & { readonly _tag: "SliceId" };
export type SliceState = "open" | "in-progress" | "done" | "failed";
export type ParentPhase = "claimed" | "planning" | "slicing" | "done";

export const SLICE_ID_PATTERN = /^[a-z0-9-]{1,32}$/;

export const slice_label = (id: SliceId, status: SliceState) => `slice:${id}:${status}`;

export const parse_slice_label = (
	label: string,
): { readonly id: SliceId; readonly status: SliceState } | null => {
	const m = label.match(/^slice:([a-z0-9-]{1,32}):(open|in-progress|done|failed)$/);
	if (!m) return null;
	return { id: m[1] as SliceId, status: m[2] as SliceState };
};

export const outcome_label = (o: Outcome) => o;
