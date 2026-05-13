/**
 * Playwright browser test — spec 057: Wire agent-view mount into dashboard
 *
 * Opens the dashboard at http://127.0.0.1:5274 (local) or http://127.0.0.1:5284 (CI/E2E_FRESH)
 * and asserts that mountAgentView was called and the three [data-group-heading]
 * elements are visible.
 *
 * This file is the live browser companion to the gate script:
 *   apps/e2e/tests/agent-view-mount.spec.ts (source-check bun script)
 *
 * The test passes without a running backend: mountAgentView calls render()
 * unconditionally, which always creates all three group heading elements
 * via GROUP_ORDER even when agentRows is empty.
 *
 * Discovered by the Playwright test runner via playwright.config.ts
 * (testDir: "./tests", testMatch: **\/*.spec.ts includes .browser.spec.ts).
 */

import { expect, test } from "@playwright/test";

test.describe("agent-view mount — live browser", () => {
	test("panel is present and three group headings are visible", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		// Wait for Astro client-side init() to execute and call mountAgentView
		await page.waitForLoadState("domcontentloaded");

		// The #agent-view-root section must be present in the DOM (added by index.astro)
		const root = page.locator("#agent-view-root");
		await expect(root).toBeAttached();

		// All three group headings must be rendered by mountAgentView
		// They appear even without a backend (render() always creates them for empty groups)
		const needsInput = page.locator('[data-group-heading="needs-input"]');
		const working = page.locator('[data-group-heading="working"]');
		const completed = page.locator('[data-group-heading="completed"]');

		await expect(needsInput).toBeVisible();
		await expect(working).toBeVisible();
		await expect(completed).toBeVisible();

		await expect(needsInput).toHaveText("Needs input");
		await expect(working).toHaveText("Working");
		await expect(completed).toHaveText("Completed");
	});
});
