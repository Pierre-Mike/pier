import { Cause, Effect, Exit, Option } from "effect";
import type { Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";

export type { AppBindings };

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

/**
 * @internal — shared by route-kit; not part of the public surface.
 * Runs an Effect with error handling (custom onError or 500 fallback).
 */
export const runHandler = async <A, E>(config: {
	effect: Effect.Effect<A, E, never>;
	context: AnyContext;
	onError?: ((e: E, c: AnyContext) => Response) | undefined;
}): Promise<A> => {
	const { effect, context: c, onError } = config;
	const exit = await Effect.runPromiseExit(effect);

	if (Exit.isSuccess(exit)) {
		return exit.value;
	}

	if (onError !== undefined) {
		const typedError = Option.getOrNull(Cause.failureOption(exit.cause));
		if (typedError !== null) {
			return onError(typedError as E, c) as A;
		}
	}

	return new Response(JSON.stringify({ error: "Internal Server Error" }), {
		status: 500,
		headers: { "Content-Type": "application/json" },
	}) as A;
};
