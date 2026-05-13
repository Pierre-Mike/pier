/**
 * Gate — spec 057: Wire agent-view mount into dashboard (unit)
 *
 * Source-text assertions on index.astro verifying the agent-view mount wiring.
 * Runs via `bun test` — no browser or dev server required.
 *
 * Checks:
 *   1. index.astro contains id="agent-view-root" DOM container
 *   2. index.astro client script imports mountAgentView from agent-view
 *   3. index.astro client script calls mountAgentView(
 *
 * RED: none of these conditions hold before implementation → all three fail.
 *
 * Exits 0 when all checks pass, 1 on first failure.
 */

import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const indexAstroPath = join(repoRoot, "apps/frontend/src/pages/index.astro");
const indexSrc = await Bun.file(indexAstroPath).text();

describe("spec 057 — agent-view mount wiring in index.astro", () => {
	test("AC1: index.astro contains id='agent-view-root' DOM container", () => {
		// RED: index.astro has no agent-view-root container — this fails until implementation
		const hasContainer =
			indexSrc.includes('id="agent-view-root"') || indexSrc.includes("id='agent-view-root'");
		expect(hasContainer).toBe(true);
	});

	test("AC2: index.astro client script imports mountAgentView from agent-view", () => {
		// RED: no mountAgentView import in index.astro — fails until implementation
		expect(indexSrc).toContain("mountAgentView");
	});

	test("AC3: index.astro client script calls mountAgentView(", () => {
		// RED: no mountAgentView call in index.astro — fails until implementation
		expect(indexSrc).toContain("mountAgentView(");
	});
});
