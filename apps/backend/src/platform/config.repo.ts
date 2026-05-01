import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Effect, Layer } from "effect";

/**
 * Walk from `startDir` upward looking for a directory that contains `marker`.
 * Returns the directory path if found, otherwise returns `null`.
 */
const markerWalk = (startDir: string, marker: string): string | null => {
	let dir = startDir;
	for (let i = 0; i < 20; i++) {
		if (existsSync(join(dir, marker))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

/**
 * Resolve the pier app root:
 * 1. `PIGUY_APP_ROOT` env override wins.
 * 2. Marker-walk from import.meta.url looking for `pier-architecture.canvas`.
 * 3. Fallback to `process.cwd()`.
 */
const resolveAppRoot = (): string => {
	if (process.env["PIGUY_APP_ROOT"]) return process.env["PIGUY_APP_ROOT"];
	const startDir = dirname(fileURLToPath(import.meta.url));
	const found =
		markerWalk(startDir, "pier-architecture.canvas") ?? markerWalk(startDir, "package.json");
	return found ?? process.cwd();
};

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
	readonly appRoot: string;
}

export interface ConfigService {
	readonly get: () => Effect.Effect<PiguyConfig, never, never>;
}
export const ConfigService = Context.GenericTag<ConfigService>("ConfigService");

export const makeConfigLayer = (workerEnv: {
	ENVIRONMENT?: string;
}): Layer.Layer<ConfigService> => {
	const home = homedir();
	const appRoot = resolveAppRoot();
	return Layer.succeed(ConfigService, {
		get: () =>
			Effect.succeed({
				version: "0.0.0",
				env: workerEnv.ENVIRONMENT ?? "production",
				appPort: Number(process.env["PIGUY_PORT"] ?? 5273),
				sandboxPort: Number(process.env["PIGUY_SANDBOX_PORT"] ?? 5275),
				zellijWebUrl: process.env["PIGUY_ZELLIJ_URL"] ?? "https://127.0.0.1:8082",
				projectsRoot: process.env["PIGUY_PROJECTS_ROOT"] ?? join(home, "Github"),
				piRoot: process.env["PIGUY_PI_ROOT"] ?? join(home, ".pi"),
				artifactsDir: process.env["PIGUY_ARTIFACTS_DIR"] ?? join(home, ".pi", "artifacts"),
				claudeProjectsRoot:
					process.env["PIGUY_CLAUDE_PROJECTS_ROOT"] ?? join(home, ".claude", "projects"),
				appRoot,
			}),
	});
};

/**
 * Default config Layer for runtime — sources env from process.env.
 * Use this in route `deps:` instead of constructing a new Layer per request.
 */
export const defaultConfigLayer: Layer.Layer<ConfigService> = makeConfigLayer({
	...(process.env["NODE_ENV"] !== undefined ? { ENVIRONMENT: process.env["NODE_ENV"] } : {}),
});

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
			appRoot: "/tmp/test-app-root",
		}),
});
