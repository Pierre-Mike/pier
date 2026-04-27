import { describe, expect, it } from "bun:test";
import { vscodeFolderUrl } from "./viewer.ts";

describe("vscodeFolderUrl", () => {
	it("strips trailing slash from projectsRoot and constructs vscode-insiders URL", () => {
		expect(vscodeFolderUrl("/srv/projects/", "alpha")).toBe(
			"vscode-insiders://file/srv/projects/alpha",
		);
	});

	it("works correctly when projectsRoot has no trailing slash", () => {
		expect(vscodeFolderUrl("/srv/projects", "alpha")).toBe(
			"vscode-insiders://file/srv/projects/alpha",
		);
	});

	it("returns vscode-insiders://file/<projectId> when projectsRoot is undefined", () => {
		expect(vscodeFolderUrl(undefined, "alpha")).toBe("vscode-insiders://file/alpha");
	});
});
