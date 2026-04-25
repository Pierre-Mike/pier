import { Schema } from "@effect/schema";
import type { ParseError } from "@effect/schema/ParseResult";
import type { Effect } from "effect";

export const VersionResponse = Schema.Struct({
	version: Schema.String,
	env: Schema.String,
});
export type VersionResponse = Schema.Schema.Type<typeof VersionResponse>;

export const getVersion = (raw: {
	version: string;
	env: string;
}): Effect.Effect<VersionResponse, ParseError, never> => Schema.decodeUnknown(VersionResponse)(raw);
