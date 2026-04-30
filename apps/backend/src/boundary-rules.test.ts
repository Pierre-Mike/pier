import { describe, expect, it } from "bun:test";
import { BOUNDARY_RULES } from "./boundary-rules.ts";

describe("dependency-cruiser boundary rules config", () => {
	const configPath = new URL("../.dependency-cruiser.cjs", import.meta.url);

	it("config file exists at apps/backend/.dependency-cruiser.cjs", async () => {
		const file = Bun.file(configPath);
		expect(await file.exists()).toBe(true);
	});

	for (const [key, ruleName] of Object.entries(BOUNDARY_RULES)) {
		it(`config contains the ${ruleName} rule (BOUNDARY_RULES.${key})`, async () => {
			const source = await Bun.file(configPath).text();
			expect(source).toContain(ruleName);
		});
	}
});
