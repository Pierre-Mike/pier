import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(e2eDir, "fixtures");

const FE_PORT = 5274;
const BE_PORT = 5273;

const backendEnv: Record<string, string> = {
	NODE_ENV: "test",
	PIGUY_PORT: String(BE_PORT),
	PIGUY_SANDBOX_PORT: "5275",
	PIGUY_ARTIFACTS_DIR: join(fixturesDir, "artifacts"),
	PIGUY_CLAUDE_PROJECTS_ROOT: join(fixturesDir, "claude-projects"),
	PIGUY_PROJECTS_ROOT: join(fixturesDir, "projects"),
	PIGUY_PI_ROOT: join(fixturesDir, "pi"),
	PIGUY_ZELLIJ_URL: "http://127.0.0.1:65535",
};

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	forbidOnly: !!process.env["CI"],
	retries: process.env["CI"] ? 1 : 0,
	workers: 1,
	reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://127.0.0.1:${FE_PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "bun --filter @pier/backend run dev",
			cwd: join(e2eDir, "..", ".."),
			url: `http://127.0.0.1:${BE_PORT}/health`,
			reuseExistingServer: !process.env["CI"] && !process.env["E2E_FRESH"],
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
			env: backendEnv,
		},
		{
			command: "bun --filter @pier/frontend run dev",
			cwd: join(e2eDir, "..", ".."),
			url: `http://127.0.0.1:${FE_PORT}`,
			reuseExistingServer: !process.env["CI"] && !process.env["E2E_FRESH"],
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
		},
	],
});
