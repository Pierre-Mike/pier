import { describe, expect, it } from "bun:test";

/**
 * Unit gate for spec 014 — ensures defineRoute is deleted and runHandler survives.
 * Failing RED form: defineRoute is currently exported from effect-handler.ts.
 * GREEN form: defineRoute is gone; runHandler remains as a function.
 */
describe("effect-handler shrink contract", () => {
	it("should NOT export defineRoute after migration", async () => {
		const m = await import("./effect-handler.ts");
		expect(m).not.toHaveProperty("defineRoute");
	});

	it("should still export runHandler as a function", async () => {
		const m = await import("./effect-handler.ts");
		expect(m).toHaveProperty("runHandler");
		expect(typeof m.runHandler).toBe("function");
	});
});
