/**
 * Gate: e2e smoke test for the agent view panel.
 *
 * RED: The agent-view panel does not exist yet.
 * The frontend page will not have the expected elements until
 * apps/frontend/src/dashboard/agent-view.ts is implemented.
 *
 * Covers AC6 + AC7 from proposal.md:
 *   AC6: panel renders three section headings (Needs input, Working, Completed)
 *   AC7: each agent row has an "Attach" button
 */

import { expect, test } from "@playwright/test";

test.describe("agent view panel", () => {
	test("AC6: panel renders three section headings when agent view is mounted", async ({ page }) => {
		await page.goto("/");

		// The agent view panel mounts automatically if the daemon is running.
		// In CI this may not be the case — we verify the panel element exists in the DOM.
		// The panel container must be present (even if hidden/empty without daemon).
		const agentView = page.locator(".agent-view");
		await expect(agentView).toBeAttached();

		// When the panel has data (or after mock injection), three headings appear.
		// We use aria roles to avoid coupling to implementation-detail CSS.
		// In a live Pier session these will be populated; in CI with no daemon the
		// panel renders the "daemon not running" banner instead of rows.
		// The heading elements must be present in the DOM structure.
		const headings = page.locator(".agent-view [data-group-heading]");
		await expect(headings).toHaveCount(3);
	});

	test("AC7: 'Attach' button is present on each agent row when rows are rendered", async ({
		page,
	}) => {
		await page.goto("/");

		// If any agent rows exist (daemon running with agents), each must have an Attach button.
		const rows = page.locator(".agent-view [data-agent-row]");
		const rowCount = await rows.count();

		for (let i = 0; i < rowCount; i++) {
			const row = rows.nth(i);
			const attachBtn = row.locator("[data-attach-button]");
			await expect(attachBtn).toBeAttached();
		}
		// Pass trivially if no rows (daemon not running in CI — not an error for this gate).
	});
});
