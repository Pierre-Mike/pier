import { describe, expect, test } from "bun:test";
import { sessionsRoute } from "./sessions.ts";

describe("POST /api/sessions/default", () => {
	const { testApp } = sessionsRoute;

	test("opens the default session", async () => {
		const res = await testApp.request("/api/sessions/default", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { id: string; projectId: string; url: string };
		expect(json.id).toBe("default");
		expect(json.url).toBeTruthy();
	});

	test("is idempotent — returns same session on second call", async () => {
		const res1 = await testApp.request("/api/sessions/default", { method: "POST" });
		const json1 = (await res1.json()) as { id: string; url: string };

		const res2 = await testApp.request("/api/sessions/default", { method: "POST" });
		const json2 = (await res2.json()) as { id: string; url: string };

		expect(json1.id).toBe(json2.id);
		expect(json1.url).toBe(json2.url);
	});
});
