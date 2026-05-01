import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import type { Hono } from "hono";
import type { AppBindings } from "./bindings.ts";
import { ConfigService } from "./config.repo.ts";
import { mountPair, type RouteModule, route } from "./route-kit.ts";

describe("route-kit integration", () => {
	it("builds a complete RouteModule<T> with mountPair", async () => {
		// Define a test service
		class IntegService extends Effect.Service<IntegService>()("IntegService", {
			succeed: { name: "svc" },
		}) {}

		const deps = {
			live: Layer.succeed(IntegService, { name: "live-svc" }),
			test: Layer.succeed(IntegService, { name: "test-svc" }),
		};

		const healthRoute = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.json({ ok: true }, 200)),
		});

		const dataRoute = route({
			deps,
			handler: (c) =>
				Effect.gen(function* () {
					const svc = yield* IntegService;
					const cfg = yield* ConfigService;
					const data = yield* cfg.get();
					return c.json({ svc: svc.name, env: data.env }, 200);
				}),
		});

		const { app, testApp } = mountPair<Hono<{ Bindings: AppBindings }>>((a, h) =>
			a.get("/health", healthRoute[h]).get("/data", dataRoute[h]),
		);

		// Type-check: satisfies RouteModule
		const _module: RouteModule<typeof app> = { app, testApp };

		// Live app assertions
		const liveHealth = await app.request("/health");
		expect(liveHealth.status).toBe(200);
		const liveHealthBody = await liveHealth.json();
		expect(liveHealthBody).toEqual({ ok: true });

		const liveData = await app.request("/data");
		expect(liveData.status).toBe(200);
		const liveDataBody = await liveData.json();
		expect(liveDataBody).toMatchObject({ svc: "live-svc" });

		// Test app assertions
		const testHealth = await testApp.request("/health");
		expect(testHealth.status).toBe(200);
		const testHealthBody = await testHealth.json();
		expect(testHealthBody).toEqual({ ok: true });

		const testData = await testApp.request("/data");
		expect(testData.status).toBe(200);
		const testDataBody = await testData.json();
		expect(testDataBody).toMatchObject({ svc: "test-svc", env: "test" });
	});

	it("integrates with existing RouteModule export pattern", async () => {
		const pingRoute = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.text("pong", 200)),
		});

		const { app, testApp } = mountPair((a, h) => a.get("/ping", pingRoute[h]));

		// Verify the module satisfies the RouteModule contract
		const module = { app, testApp } satisfies RouteModule<typeof app>;

		const livePing = await module.app.request("/ping");
		expect(livePing.status).toBe(200);
		const livePingText = await livePing.text();
		expect(livePingText).toBe("pong");

		const testPing = await module.testApp.request("/ping");
		expect(testPing.status).toBe(200);
		const testPingText = await testPing.text();
		expect(testPingText).toBe("pong");
	});
});
