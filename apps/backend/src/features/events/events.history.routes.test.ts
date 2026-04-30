import { describe, expect, test } from "bun:test";
import { eventsHistoryRoute } from "./events.history.routes.ts";

describe("GET /api/events/history", () => {
	const { testApp } = eventsHistoryRoute;

	test("returns event history", async () => {
		const res = await testApp.request("/api/events/history");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { events: unknown[] };
		expect(Array.isArray(json.events)).toBe(true);
	});

	test("accepts limit parameter", async () => {
		const res = await testApp.request("/api/events/history?limit=100");
		expect(res.status).toBe(200);
	});

	test("accepts project filter", async () => {
		const res = await testApp.request("/api/events/history?project=foo");
		expect(res.status).toBe(200);
	});
});

describe("GET /api/logs", () => {
	const { testApp } = eventsHistoryRoute;

	test("returns logs from history", async () => {
		const res = await testApp.request("/api/logs");
		expect(res.status).toBe(200);
		const json = (await res.json()) as { events: unknown[] };
		expect(Array.isArray(json.events)).toBe(true);
	});

	test("accepts query filters", async () => {
		const res = await testApp.request("/api/logs?project=foo&session=bar&limit=100");
		expect(res.status).toBe(200);
	});
});
