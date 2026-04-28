import { describe, expect, test } from "bun:test";

const indexAstro = await Bun.file(new URL("../pages/index.astro", import.meta.url)).text();

describe("dashboard settings modal wiring", () => {
	test("dashboard imports the settings modal initializer", () => {
		expect(indexAstro).toContain('import { wireSettingsModal } from "../dashboard/settings";');
	});

	test("dashboard wires the settings modal during UI init", () => {
		const wireUiBody =
			indexAstro.match(/function wireUI\(\) \{(?<body>[\s\S]*?)\n\t\}/)?.groups?.body ?? "";

		expect(wireUiBody).toContain("wireSettingsModal();");
	});
});
