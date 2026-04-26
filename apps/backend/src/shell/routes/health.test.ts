import { describe, expect, it } from "bun:test";
import { healthRoute } from "./health.ts";

describe("GET /health", () => {
	it("200 returns ok status and timestamp", async () => {
		const res = await healthRoute.testApp.request("/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; timestamp: number };
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("number");
		expect(body.timestamp).toBeGreaterThan(0);
	});
});
