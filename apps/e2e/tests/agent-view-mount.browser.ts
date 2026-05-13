/**
 * Playwright browser test — spec 057: Wire agent-view mount into dashboard
 *
 * Opens the dashboard at http://127.0.0.1:5274 and asserts that mountAgentView
 * was called and the three [data-group-heading] elements are visible.
 *
 * This file is NOT the gate path — it is invoked by the gate script
 * (apps/e2e/tests/agent-view-mount.spec.ts) via:
 *   bunx playwright test --config apps/e2e/playwright.config.ts <this-file>
 *
 * The test passes without a running backend: mountAgentView calls render()
 * unconditionally, which always creates all three group heading elements
 * via the GROUP_ORDER loop even when agentRows is empty.
 *
 * Uses reuseExistingServer (non-fresh mode): expects the Astro dev server
 * at http://127.0.0.1:5274. In CI (E2E_FRESH=1), playwright.config.ts boots
 * a fresh frontend server at port 5284.
 */

import { expect, test } from "@playwright/test";

test.describe("agent-view mount", () => {
	test("panel is present and three group headings are visible", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		// Wait for the client-side script to execute and mount the panel
		// The agent-view-root section must exist in the DOM
		await expect(page.locator("#agent-view-root")).toBeVisible();

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
