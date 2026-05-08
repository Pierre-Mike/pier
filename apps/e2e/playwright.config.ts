import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(e2eDir, "fixtures");

const fresh = !!process.env["CI"] || !!process.env["E2E_FRESH"];

// Local-reuse mode shares pier's standard dev ports so `bun run e2e` against
// a running pier session is a 2s sanity ping. Fresh mode shifts to a separate
// port pair so it can boot a clean BE+FE without colliding with running pier.
const FE_PORT = fresh ? 5284 : 5274;
const BE_PORT = fresh ? 5283 : 5273;
const SANDBOX_PORT = fresh ? 5285 : 5275;

const baseURL = `http://127.0.0.1:${FE_PORT}`;
const backendURL = `http://127.0.0.1:${BE_PORT}`;

// Surface the active backend URL to specs via env (read inside tests).
process.env["E2E_BACKEND_URL"] = backendURL;

const backendEnv: Record<string, string> = {
	NODE_ENV: "test",
	PIGUY_PORT: String(BE_PORT),
	PIGUY_SANDBOX_PORT: String(SANDBOX_PORT),
	PIGUY_ARTIFACTS_DIR: join(fixturesDir, "artifacts"),
	PIGUY_CLAUDE_PROJECTS_ROOT: join(fixturesDir, "claude-projects"),
	PIGUY_PROJECTS_ROOT: join(fixturesDir, "projects"),
	PIGUY_PI_ROOT: join(fixturesDir, "pi"),
	PIGUY_ZELLIJ_URL: "http://127.0.0.1:65535",
};

const frontendEnv: Record<string, string> = {
	PUBLIC_API_URL: backendURL,
};

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	forbidOnly: !!process.env["CI"],
	retries: process.env["CI"] ? 1 : 0,
	workers: 1,
	reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "bun --watch src/main.ts",
			cwd: join(e2eDir, "..", "backend"),
			url: `${backendURL}/health`,
			reuseExistingServer: !fresh,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: backendEnv,
		},
		{
			command: `bunx astro dev --port ${FE_PORT}`,
			cwd: join(e2eDir, "..", "frontend"),
			url: baseURL,
			reuseExistingServer: !fresh,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: frontendEnv,
		},
	],
});
