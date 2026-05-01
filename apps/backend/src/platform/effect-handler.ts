import { Cause, Effect, Exit, Layer, Option } from "effect";
import type { Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";

export type { AppBindings };

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

/**
 * defineRoute overload 0: escape hatch for dynamic imports — handler R is
 * `unknown` (e.g. after a `m as { handler?: (c) => Effect<unknown, unknown, unknown> }` cast).
 * deps are accepted without constraining handler's R; R must not be never.
 * Returns `(c) => Promise<Response>` so Hono's HandlerResponse constraint is met.
 */
export function defineRoute<R>(config: {
	deps: [R] extends [never] ? never : ((c: AnyContext) => Layer.Layer<R>) | Layer.Layer<R>;
	onError?: (error: never, c: AnyContext) => Response;
	handler: (c: AnyContext) => Effect.Effect<unknown, unknown, unknown>;
}): (c: AnyContext) => Promise<Response>;

/** defineRoute overload 1: no deps — R must be never, `deps` is forbidden */
export function defineRoute<R extends never, E = never, A = Response>(config: {
	deps?: never;
	onError?: (error: E, c: AnyContext) => Response;
	handler: (c: AnyContext) => Effect.Effect<A, E, R>;
}): (c: AnyContext) => Promise<A>;

/**
 * defineRoute overload 2: with deps — R is not never, `deps` is required.
 * The `[R] extends [never] ? never : Layer<R>` conditional makes `deps: never`
 * when R=never (even though overload 1 should win), ensuring both overloads
 * reject extra deps due to Layer<R>'s contravariance in ROut.
 */
export function defineRoute<R, E = never, A = Response>(config: {
	deps: [R] extends [never] ? never : ((c: AnyContext) => Layer.Layer<R>) | Layer.Layer<R>;
	onError?: (error: E, c: AnyContext) => Response;
	handler: (c: AnyContext) => Effect.Effect<A, E, R>;
}): (c: AnyContext) => Promise<A>;

export function defineRoute(config: {
	deps?: ((c: AnyContext) => Layer.Layer<never>) | Layer.Layer<never>;
	onError?: (error: never, c: AnyContext) => Response;
	handler: (c: AnyContext) => Effect.Effect<unknown, unknown, unknown>;
}): (c: AnyContext) => Promise<unknown> {
	const deps = config.deps;
	const errorHandler = config.onError;
	const fn = config.handler as (c: AnyContext) => Effect.Effect<unknown, never, never>;

	return async (c) => {
		const layer: Layer.Layer<never> =
			deps === undefined
				? (Layer.empty as Layer.Layer<never>)
				: typeof deps === "function"
					? (deps(c) as Layer.Layer<never>)
					: (deps as Layer.Layer<never>);

		const effect = (fn(c) as Effect.Effect<unknown, never, never>).pipe(Effect.provide(layer));
		return runHandler({ effect, context: c, onError: errorHandler });
	};
}

/**
 * @internal — shared by defineRoute and route-kit; not part of the public surface.
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
