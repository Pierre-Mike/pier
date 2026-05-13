/**
 * Effect.Schema decoders for the Claude daemon on-disk state shapes.
 * Drift protection: if the CLI changes roster.json or state.json shape,
 * decodeRoster / decodeAgentState will surface the mismatch at runtime.
 */

import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Roster schema
// ---------------------------------------------------------------------------

// Worker entry inside roster.json workers map
const WorkerEntrySchema = Schema.Struct({
	pid: Schema.Number,
	sessionId: Schema.String,
	cwd: Schema.String,
	cliVersion: Schema.String,
	rendezvousSock: Schema.String,
	ptySock: Schema.String,
	dispatch: Schema.String,
	agent: Schema.String,
	isolation: Schema.String,
	seed: Schema.String,
});

// roster.json top-level shape
const RosterSchema = Schema.Struct({
	workers: Schema.Record({ key: Schema.String, value: WorkerEntrySchema }),
});

export type RosterShape = Schema.Schema.Type<typeof RosterSchema>;
export type WorkerEntry = Schema.Schema.Type<typeof WorkerEntrySchema>;

// Synchronous Either-style decoder for tests (no Effect runtime needed)
export const decodeRoster = (
	raw: unknown,
): { _tag: "Right"; right: RosterShape } | { _tag: "Left"; left: unknown } => {
	const result = Schema.decodeUnknownEither(RosterSchema)(raw);
	// Effect's Either has _tag: "Right" | "Left"
	return result as { _tag: "Right"; right: RosterShape } | { _tag: "Left"; left: unknown };
};

// ---------------------------------------------------------------------------
// Agent state schema
// ---------------------------------------------------------------------------

// Valid daemon state string values
const AgentStateValueSchema = Schema.Literal(
	"working",
	"blocked",
	"completed",
	"failed",
	"stopped",
	"idle",
);

export type AgentStateValue = Schema.Schema.Type<typeof AgentStateValueSchema>;

// state.json shape (only the fields we use; extra fields tolerated)
const AgentStateSchema = Schema.Struct({
	state: AgentStateValueSchema,
	detail: Schema.optional(Schema.NullOr(Schema.String)),
	needs: Schema.optional(Schema.NullOr(Schema.String)),
	output: Schema.optional(Schema.NullOr(Schema.String)),
	name: Schema.optional(Schema.NullOr(Schema.String)),
	intent: Schema.optional(Schema.NullOr(Schema.String)),
	cwd: Schema.String,
	updatedAt: Schema.String,
	cliVersion: Schema.String,
	daemonShort: Schema.optional(Schema.String),
});

export type AgentStateShape = Schema.Schema.Type<typeof AgentStateSchema>;

// Synchronous Either-style decoder
export const decodeAgentState = (
	raw: unknown,
): { _tag: "Right"; right: AgentStateShape } | { _tag: "Left"; left: unknown } => {
	const result = Schema.decodeUnknownEither(AgentStateSchema)(raw);
	return result as { _tag: "Right"; right: AgentStateShape } | { _tag: "Left"; left: unknown };
};
