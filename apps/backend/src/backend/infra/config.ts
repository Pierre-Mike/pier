import { Context, Effect, Layer } from "effect";

export interface ConfigService {
	readonly get: () => Effect.Effect<{ version: string; env: string }, never, never>;
}
export const ConfigService = Context.GenericTag<ConfigService>("ConfigService");

export const makeConfigLayer = (workerEnv: { ENVIRONMENT?: string }): Layer.Layer<ConfigService> =>
	Layer.succeed(ConfigService, {
		get: () => Effect.succeed({ version: "0.0.0", env: workerEnv.ENVIRONMENT ?? "production" }),
	});

export const ConfigTest: Layer.Layer<ConfigService> = Layer.succeed(ConfigService, {
	get: () => Effect.succeed({ version: "0.0.0", env: "test" }),
});
