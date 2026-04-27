/**
 * Post-tool-use verification: after a file is written/edited, run deterministic checks.
 *
 *   - Biome lint on recognised file types
 *   - Colocated-test presence warning for .ts files in apps/ or packages/
 *   - Per-workspace typecheck (turbo --filter) on changed apps/* files
 */

import { existsSync } from "node:fs";
import { run, type ToolEvent } from "./types";

const LINTABLE = /\.(ts|tsx|js|jsx|astro|json|md|mdx)$/;

function respond(output: Record<string, unknown>): void {
	console.log(JSON.stringify(output));
}

export async function verifyPostToolUse(event: ToolEvent): Promise<void> {
	const filePath = ((event.tool_response?.filePath as string) ?? event.tool_input.file_path) as
		| string
		| undefined;
	if (!filePath) return;

	if (LINTABLE.test(filePath)) {
		await run(["bun", "run", "lint:file", filePath]);
	}

	if (
		(filePath.includes("/apps/") || filePath.includes("/packages/")) &&
		filePath.endsWith(".ts") &&
		!filePath.endsWith(".d.ts")
	) {
		if (filePath.endsWith(".test.ts")) {
			const src = filePath.replace(/\.test\.ts$/, ".ts");
			if (!existsSync(src)) {
				respond({
					systemMessage: `Orphaned test: no matching source file for ${filePath}`,
				});
			}
		} else {
			const testFile = filePath.replace(/\.ts$/, ".test.ts");
			if (!existsSync(testFile)) {
				respond({
					systemMessage: `Note: ${filePath} has no colocated test file`,
				});
			}
		}
	}

	if (filePath.includes("/apps/backend/")) {
		await run(["bunx", "turbo", "typecheck", "--filter=backend"]);
	} else if (filePath.includes("/apps/frontend/")) {
		await run(["bunx", "turbo", "typecheck", "--filter=frontend"]);
	}
}
