/**
 * Structural invariants for @piguy/api-contract.
 *
 * Pure functions that encode the repo-level rules enforced by CI.
 * Consumed by invariants.test.ts (local) and mirrored in .github/workflows/ci.yml.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Allowed runtime dependencies for api-contract. */
const ALLOWED_DEPS = new Set(["@piguy/backend", "hono"]);

/** Returns true if api-contract only has allowed runtime dependencies. */
export function hasOnlyAllowedDeps(pkgJsonPath: string): boolean {
	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as Record<string, unknown>;
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	const deps = pkg["dependencies"] as Record<string, string> | undefined;
	if (!deps) return true;
	return Object.keys(deps).every((dep) => ALLOWED_DEPS.has(dep));
}

/** Recursively collect .ts/.tsx files under dir, excluding node_modules. */
export function collectTsFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...collectTsFiles(full));
		} else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
			results.push(full);
		}
	}
	return results;
}

/** Returns paths (relative to repoRoot) of files containing "as unknown as". */
export function findCastViolations(dir: string, repoRoot: string): readonly string[] {
	return collectTsFiles(dir)
		.filter((file) => readFileSync(file, "utf-8").includes("as unknown as"))
		.map((file) => file.replace(repoRoot, ""));
}
