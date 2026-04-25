import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";

export interface PiguyConfig {
	readonly version: string;
	readonly env: string;
	readonly appPort: number;
	readonly sandboxPort: number;
	readonly zellijWebUrl: string;
	readonly projectsRoot: string;
	readonly artifactsDir: string;
	readonly claudeProjectsRoot: string;
	readonly piRoot: string;
}

export interface ConfigService {
	readonly get: () => Effect.Effect<PiguyConfig, never, never>;
}
export const ConfigService = Context.GenericTag<ConfigService>("ConfigService");

export const makeConfigLayer = (workerEnv: {
	ENVIRONMENT?: string;
}): Layer.Layer<ConfigService> => {
	const home = homedir();
	return Layer.succeed(ConfigService, {
		get: () =>
			Effect.succeed({
				version: "0.0.0",
				env: workerEnv.ENVIRONMENT ?? "production",
				appPort: Number(process.env["PIGUY_PORT"] ?? 5173),
				sandboxPort: Number(process.env["PIGUY_SANDBOX_PORT"] ?? 5174),
				zellijWebUrl: process.env["PIGUY_ZELLIJ_URL"] ?? "https://127.0.0.1:8082",
				projectsRoot: process.env["PIGUY_PROJECTS_ROOT"] ?? join(home, "Github"),
				piRoot: process.env["PIGUY_PI_ROOT"] ?? join(home, ".pi"),
				artifactsDir: process.env["PIGUY_ARTIFACTS_DIR"] ?? join(home, ".pi", "artifacts"),
				claudeProjectsRoot:
					process.env["PIGUY_CLAUDE_PROJECTS_ROOT"] ?? join(home, ".claude", "projects"),
			}),
	});
};

export const ConfigTest: Layer.Layer<ConfigService> = Layer.succeed(ConfigService, {
	get: () =>
		Effect.succeed({
			version: "0.0.0",
			env: "test",
			appPort: 5173,
			sandboxPort: 5174,
			zellijWebUrl: "https://test.local:8082",
			projectsRoot: "/tmp/test-projects",
			piRoot: "/tmp/test-pi",
			artifactsDir: "/tmp/test-pi/artifacts",
			claudeProjectsRoot: "/tmp/test-claude/projects",
		}),
});
