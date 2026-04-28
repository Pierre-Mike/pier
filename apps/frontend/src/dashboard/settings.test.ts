import { describe, expect, test } from "bun:test";

const indexAstro = await Bun.file(new URL("../pages/index.astro", import.meta.url)).text();
const settingsSource = await Bun.file(new URL("./settings.ts", import.meta.url)).text();

describe("dashboard settings modal wiring", () => {
	test("dashboard imports the settings modal initializer", () => {
		expect(indexAstro).toContain('import { wireSettingsModal } from "../dashboard/settings";');
	});

	test("dashboard wires the settings modal during UI init", () => {
		const wireUiBody =
			indexAstro.match(/function wireUI\(\) \{(?<body>[\s\S]*?)\n\t\}/)?.groups?.body ?? "";

		expect(wireUiBody).toContain("wireSettingsModal();");
	});

	test("share tab uses only the read-only zellij settings endpoint", () => {
		expect(settingsSource).toContain('settings["zellij-readonly"].$get()');
		expect(settingsSource).not.toContain("getZellijToken");
		expect(settingsSource).not.toContain("zellij-token");
	});

	test("settings copy communicates watch-only read-only access", () => {
		expect(settingsSource).toContain("Read-only zellij watcher URL");
		expect(settingsSource).toContain("watch-only URL");
		expect(settingsSource).toContain("Viewers cannot type into or control your session");
		expect(settingsSource).toContain("local zellij backend");
		expect(settingsSource).not.toContain("zellij URL (read-write)");
	});
});
