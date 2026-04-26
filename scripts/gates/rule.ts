/**
 * Gate for kind:rule — runs a custom checker pointed at by `gate:`.
 * Expects the file to export a default async function returning {pass, message}.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export async function checkRule(paths: string[]): Promise<{ pass: boolean; message: string }> {
	for (const path of paths) {
		const abs = join(process.cwd(), path);
		if (!existsSync(abs)) {
			return { pass: false, message: `rule artifact missing at ${path}` };
		}
		const mod = (await import(abs)) as {
			default?: () => Promise<{ pass: boolean; message: string }>;
		};
		if (!mod.default) {
			return { pass: false, message: `${path} has no default export` };
		}
		const result = await mod.default();
		if (!result.pass) return result;
	}
	return { pass: true, message: `${paths.length} rule(s) pass` };
}
