import { Cause, Effect, Exit, Layer, Option } from "effect";
import type { Context as HonoContext } from "hono";
import type { AppBindings } from "./bindings.ts";

export type { AppBindings };

type AnyContext = HonoContext<{ Bindings: AppBindings }>;

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

		const exit = await Effect.runPromiseExit(
			(fn(c) as Effect.Effect<unknown, never, never>).pipe(Effect.provide(layer)),
		);

		if (Exit.isSuccess(exit)) {
			return exit.value;
		}

		if (errorHandler !== undefined) {
			const typedError = Option.getOrNull(Cause.failureOption(exit.cause));
			if (typedError !== null) {
				return errorHandler(typedError as never, c) as unknown;
			}
		}

		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		}) as unknown;
	};
}
