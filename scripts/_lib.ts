import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export type SpecKind = "code" | "rule" | "workflow" | "writeup";

export type GateLevel = "unit" | "integration" | "e2e";

export interface GateEntry {
	readonly path: string;
	readonly level: GateLevel;
}

const VALID_GATE_LEVELS: readonly GateLevel[] = ["unit", "integration", "e2e"];

export interface SpecFrontmatter {
	id: string;
	title: string;
	status: "active" | "archived";
	kind: SpecKind;
	gate: string | string[] | Array<{ path: string; level: string }>;
	created: string;
	owner: string;
	depends_on: string[];
	supersedes: string | null;
}

export interface Spec {
	slug: string;
	dir: string;
	frontmatter: SpecFrontmatter;
	body: string;
}

const REPO_ROOT = process.cwd();
const SPECS_DIR = join(REPO_ROOT, "specs");

export function listActiveSpecs(): Spec[] {
	const dir = join(SPECS_DIR, "active");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => !name.startsWith("_") && !name.startsWith("."))
		.map((slug) => loadSpec(join(dir, slug)))
		.filter((s): s is Spec => s !== null);
}

export function listArchivedIds(): Set<string> {
	const dir = join(SPECS_DIR, "archive");
	if (!existsSync(dir)) return new Set();
	const ids = new Set<string>();
	for (const name of readdirSync(dir)) {
		const spec = loadSpec(join(dir, name));
		if (spec) ids.add(spec.frontmatter.id);
	}
	return ids;
}

export function loadSpec(dir: string): Spec | null {
	const proposalPath = join(dir, "proposal.md");
	if (!existsSync(proposalPath)) return null;
	const raw = readFileSync(proposalPath, "utf-8");
	const parsed = matter(raw);
	const fm = parsed.data as Partial<SpecFrontmatter>;
	if (!fm.id || !fm.kind || !fm.gate) return null;
	return {
		slug: dir.split("/").pop() ?? "",
		dir,
		frontmatter: {
			id: fm.id,
			title: fm.title ?? "",
			status: fm.status ?? "active",
			kind: fm.kind,
			gate: fm.gate,
			created: fm.created ?? "",
			owner: fm.owner ?? "main",
			depends_on: fm.depends_on ?? [],
			supersedes: fm.supersedes ?? null,
		},
		body: parsed.content,
	};
}

/**
 * Parse the `gate:` frontmatter field into a list of typed entries.
 *
 * Accepted shapes:
 *  - scalar string  → [{path: string, level: "unit"}]  (legacy lift)
 *  - string[]       → [{path: string, level: "unit"}, ...]  (legacy list lift)
 *  - {path, level}[]  → typed entries, validated
 *
 * Throws on:
 *  - unknown level string
 *  - duplicate paths
 */
export function gateEntries(spec: { frontmatter: { gate: unknown } }): readonly GateEntry[] {
	const g = spec.frontmatter.gate;

	let raw: Array<{ path: string; level: string }>;

	if (typeof g === "string") {
		// Scalar legacy: lift to unit
		raw = [{ path: g, level: "unit" }];
	} else if (Array.isArray(g)) {
		if (g.length === 0) return [];
		if (typeof g[0] === "string") {
			// string[] legacy: lift each to unit
			raw = (g as string[]).map((p) => ({ path: p, level: "unit" }));
		} else {
			// typed list
			raw = g as Array<{ path: string; level: string }>;
		}
	} else {
		throw new Error(`invalid gate field: expected string or array, got ${typeof g}`);
	}

	// Validate levels and collect entries
	const seen = new Set<string>();
	const entries: GateEntry[] = [];
	for (const item of raw) {
		if (!VALID_GATE_LEVELS.includes(item.level as GateLevel)) {
			throw new Error(`unknown gate level '${item.level}'; expected unit|integration|e2e`);
		}
		if (seen.has(item.path)) {
			throw new Error(`duplicate gate path '${item.path}'`);
		}
		seen.add(item.path);
		entries.push({ path: item.path, level: item.level as GateLevel });
	}
	return entries;
}

export function gatePaths(spec: Spec): string[] {
	const g = spec.frontmatter.gate;
	if (typeof g === "string") return [g];
	if (Array.isArray(g)) {
		if (g.length === 0) return [];
		if (typeof g[0] === "string") return g as string[];
		return (g as Array<{ path: string; level: string }>).map((e) => e.path);
	}
	return [];
}

export function isReady(spec: Spec, archivedIds: Set<string>): boolean {
	return spec.frontmatter.depends_on.every((d) => archivedIds.has(d));
}

export function unresolvedDeps(spec: Spec, archivedIds: Set<string>): string[] {
	return spec.frontmatter.depends_on.filter((d) => !archivedIds.has(d));
}

export const VALID_KINDS: SpecKind[] = ["code", "rule", "workflow", "writeup"];
