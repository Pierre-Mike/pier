import { describe, expect, it } from "bun:test";
import { Effect, Exit } from "effect";
import { getVersion } from "./version.ts";

describe("getVersion", () => {
	it("succeeds with valid input", async () => {
		const result = await Effect.runPromise(getVersion({ version: "1.0.0", env: "production" }));
		expect(result).toEqual({ version: "1.0.0", env: "production" });
	});

	it("fails with invalid input", () => {
		const exit = Effect.runSyncExit(getVersion({ version: 123 as unknown as string, env: "prod" }));
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
