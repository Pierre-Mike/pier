import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { ConfigService, ConfigTest } from "./config.ts";

describe("ConfigTest layer", () => {
	it("returns test config", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(ConfigService, (s) => s.get()),
				ConfigTest,
			),
		);
		expect(result).toEqual({ version: "0.0.0", env: "test" });
	});
});
