import { expect, test } from "@playwright/test";

const backendURL = process.env["E2E_BACKEND_URL"] ?? "http://127.0.0.1:5273";

test.describe("smoke", () => {
	test("backend /health returns ok", async ({ request }) => {
		const res = await request.get(`${backendURL}/health`);
		expect(res.status()).toBe(200);
		const body = (await res.json()) as { status: string; timestamp: number };
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("number");
	});

	test("frontend home page renders", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle("pier");
	});
});
