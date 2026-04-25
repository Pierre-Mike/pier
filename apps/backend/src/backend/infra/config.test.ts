import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { ConfigService, ConfigTest } from "./config.ts";

describe("ConfigTest layer", () => {
	it("returns test config with all fields", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(ConfigService, (s) => s.get()),
				ConfigTest,
			),
		);
		expect(result).toEqual({
			version: "0.0.0",
			env: "test",
			appPort: 5173,
			sandboxPort: 5174,
			zellijWebUrl: "https://test.local:8082",
			projectsRoot: "/tmp/test-projects",
			piRoot: "/tmp/test-pi",
			artifactsDir: "/tmp/test-pi/artifacts",
			claudeProjectsRoot: "/tmp/test-claude/projects",
		});
	});

	it("provides deterministic test values", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(ConfigService, (s) => s.get()),
				ConfigTest,
			),
		);
		expect(result.env).toBe("test");
		expect(result.appPort).toBeTypeOf("number");
		expect(result.projectsRoot).toMatch(/^\/tmp/);
		expect(result.artifactsDir).toContain("artifacts");
		expect(result.claudeProjectsRoot).toContain("claude");
	});
});
