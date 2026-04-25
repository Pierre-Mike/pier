import { describe, expect, it } from "bun:test";
import { BOUNDARY_RULES } from "./boundary-rules.ts";

// RED → GREEN: these tests fail until .dependency-cruiser.cjs is created with the correct rules.
// They verify that the config file exists and names the exact rules required by the architecture.
describe("dependency-cruiser boundary rules config", () => {
	it("config file exists at apps/backend/.dependency-cruiser.cjs", async () => {
		const configPath = new URL("../../.dependency-cruiser.cjs", import.meta.url);
		const file = Bun.file(configPath);
		expect(await file.exists()).toBe(true);
	});

	it("config contains the no-effect-handler-to-core-or-infra rule", async () => {
		const configPath = new URL("../../.dependency-cruiser.cjs", import.meta.url);
		const source = await Bun.file(configPath).text();
		expect(source).toContain(BOUNDARY_RULES.NO_EFFECT_HANDLER_TO_CORE_OR_INFRA);
	});

	it("config contains the no-core-to-shell-or-infra rule", async () => {
		const configPath = new URL("../../.dependency-cruiser.cjs", import.meta.url);
		const source = await Bun.file(configPath).text();
		expect(source).toContain(BOUNDARY_RULES.NO_CORE_TO_SHELL_OR_INFRA);
	});
});
