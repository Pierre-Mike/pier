import { Context, type Effect } from "effect";
import type { IssueId, IssueRef, Outcome, RoutingLabel, WorkerId } from "./state.ts";

export interface PrStatus {
	readonly number: number;
	readonly state: "OPEN" | "MERGED" | "CLOSED";
	readonly merged: boolean;
}

export interface GhAdapter {
	readonly fetch_candidates: (filter: {
		readonly aligned: true;
		readonly routing: RoutingLabel;
	}) => Effect.Effect<ReadonlyArray<IssueRef>, GhError>;

	readonly claim: (
		issue: IssueId,
		worker: WorkerId,
	) => Effect.Effect<void, GhError | ClaimContended>;

	readonly release: (issue: IssueId, outcome: Outcome | null) => Effect.Effect<void, GhError>;

	readonly view: (issue: IssueId) => Effect.Effect<IssueRef, GhError | NotFound>;

	readonly fetch_body: (issue: IssueId) => Effect.Effect<string, GhError | NotFound>;

	readonly find_pr_by_branch: (branch: string) => Effect.Effect<PrStatus | null, GhError>;

	readonly comment: (issue: IssueId, body: string) => Effect.Effect<void, GhError>;

	readonly close: (issue: IssueId) => Effect.Effect<void, GhError>;

	readonly set_slice_label: (req: {
		readonly issue: IssueId;
		readonly slice_id: string;
		readonly from: string | null;
		readonly to: string;
	}) => Effect.Effect<void, GhError>;
}

export class GhAdapterTag extends Context.Tag("@pier/orchestrator/GhAdapter")<
	GhAdapterTag,
	GhAdapter
>() {}

export class GhError extends Error {
	readonly _tag = "GhError";
	constructor(
		readonly cmd: string,
		readonly stderr: string,
	) {
		super(`gh failed: ${cmd}\n${stderr}`);
	}
}

export class ClaimContended extends Error {
	readonly _tag = "ClaimContended";
	constructor(readonly issue: IssueId) {
		super(`claim contended on ${issue}`);
	}
}

export class NotFound extends Error {
	readonly _tag = "NotFound";
	constructor(readonly issue: IssueId) {
		super(`issue not found: ${issue}`);
	}
}
