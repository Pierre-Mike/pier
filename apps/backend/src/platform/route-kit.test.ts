import { describe, expect, it } from "bun:test";
import { Context, Effect, Layer } from "effect";
import { Hono } from "hono";
import type { AppBindings } from "./bindings.ts";
import { ConfigService } from "./config.repo.ts";
import { mountPair, route, routeAdvanced } from "./route-kit.ts";
import type { RouteModule } from "./route-types.ts";

interface TestSvc {
	readonly value: string;
}
const TestSvc = Context.GenericTag<TestSvc>("@test/TestSvc");

interface FooSvc {
	readonly val: number;
}
const FooSvc = Context.GenericTag<FooSvc>("@test/FooSvc");

interface BarSvc {
	readonly name: string;
}
const BarSvc = Context.GenericTag<BarSvc>("@test/BarSvc");

interface DynSvc {
	readonly val: number;
}
const DynSvc = Context.GenericTag<DynSvc>("@test/DynSvc");

interface BizSvc {
	readonly tag: "biz";
}
const BizSvc = Context.GenericTag<BizSvc>("@test/BizSvc");

interface IntegSvc {
	readonly name: string;
}
const IntegSvc = Context.GenericTag<IntegSvc>("@test/IntegSvc");

describe("route() with ServicePair<R>", () => {
	it("provides ConfigService to both live and test halves", async () => {
		const deps = {
			live: Layer.succeed(TestSvc, { value: "live-svc" }),
			test: Layer.succeed(TestSvc, { value: "test-svc" }),
		};

		const { live, test } = route({
			deps,
			handler: (c) =>
				Effect.gen(function* () {
					const cfg = yield* ConfigService;
					const svc = yield* TestSvc;
					const data = yield* cfg.get();
					return c.json({ env: data.env, svc: svc.value }, 200);
				}),
		});

		const liveApp = new Hono<{ Bindings: AppBindings }>().get("/test", live);
		const liveRes = await liveApp.request("/test");
		expect(liveRes.status).toBe(200);
		const liveBody = await liveRes.json();
		expect(liveBody).toMatchObject({ svc: "live-svc" });

		const testApp = new Hono<{ Bindings: AppBindings }>().get("/test", test);
		const testRes = await testApp.request("/test");
		expect(testRes.status).toBe(200);
		const testBody = await testRes.json();
		expect(testBody).toMatchObject({ env: "test", svc: "test-svc" });
	});

	it("returns symmetric live/test pair", async () => {
		const deps = {
			live: Layer.succeed(FooSvc, { val: 100 }),
			test: Layer.succeed(FooSvc, { val: 42 }),
		};

		const pair = route({
			deps,
			handler: (c) =>
				Effect.gen(function* () {
					const foo = yield* FooSvc;
					return c.json({ val: foo.val }, 200);
				}),
		});

		expect(pair).toHaveProperty("live");
		expect(pair).toHaveProperty("test");
		expect(typeof pair.live).toBe("function");
		expect(typeof pair.test).toBe("function");

		const liveApp = new Hono().get("/x", pair.live);
		const liveRes = await liveApp.request("/x");
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ val: 100 });

		const testApp = new Hono().get("/x", pair.test);
		const testRes = await testApp.request("/x");
		const testBody = await testRes.json();
		expect(testBody).toEqual({ val: 42 });
	});
});

describe("route() with handler only (config-only overload)", () => {
	it("provides ConfigService to both halves when no deps", async () => {
		const { live, test } = route({
			handler: (c) =>
				Effect.gen(function* () {
					const cfg = yield* ConfigService;
					const data = yield* cfg.get();
					return c.json({ env: data.env }, 200);
				}),
		});

		const liveApp = new Hono().get("/cfg", live);
		const liveRes = await liveApp.request("/cfg");
		expect(liveRes.status).toBe(200);

		const testApp = new Hono().get("/cfg", test);
		const testRes = await testApp.request("/cfg");
		expect(testRes.status).toBe(200);
		const testBody = await testRes.json();
		expect(testBody).toMatchObject({ env: "test" });
	});
});

describe("route() with deps: 'none' (R = never)", () => {
	it("produces live/test pair with no Layer composition", async () => {
		const { live, test } = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.json({ ok: true }, 200)),
		});

		const liveApp = new Hono().get("/none", live);
		const liveRes = await liveApp.request("/none");
		expect(liveRes.status).toBe(200);
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ ok: true });

		const testApp = new Hono().get("/none", test);
		const testRes = await testApp.request("/none");
		expect(testRes.status).toBe(200);
		const testBody = await testRes.json();
		expect(testBody).toEqual({ ok: true });
	});
});

describe("routeAdvanced()", () => {
	it("accepts explicit Layer<R> for both halves without auto-ConfigService", async () => {
		const { live, test } = routeAdvanced({
			liveDeps: Layer.succeed(BarSvc, { name: "live-bar" }),
			testDeps: Layer.succeed(BarSvc, { name: "test-bar" }),
			handler: (c) =>
				Effect.gen(function* () {
					const bar = yield* BarSvc;
					return c.json({ name: bar.name }, 200);
				}),
		});

		const liveApp = new Hono().get("/bar", live);
		const liveRes = await liveApp.request("/bar");
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ name: "live-bar" });

		const testApp = new Hono().get("/bar", test);
		const testRes = await testApp.request("/bar");
		const testBody = await testRes.json();
		expect(testBody).toEqual({ name: "test-bar" });
	});

	it("accepts factory form () => Layer<R>", async () => {
		const { live, test } = routeAdvanced({
			liveDeps: (_c) => Layer.succeed(DynSvc, { val: 999 }),
			testDeps: () => Layer.succeed(DynSvc, { val: 123 }),
			handler: (c) =>
				Effect.gen(function* () {
					const dyn = yield* DynSvc;
					return c.json({ val: dyn.val }, 200);
				}),
		});

		const liveApp = new Hono().get("/dyn", live);
		const liveRes = await liveApp.request("/dyn");
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ val: 999 });

		const testApp = new Hono().get("/dyn", test);
		const testRes = await testApp.request("/dyn");
		const testBody = await testRes.json();
		expect(testBody).toEqual({ val: 123 });
	});
});

describe("mountPair()", () => {
	it("produces twin Hono apps from one builder", async () => {
		const r1 = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.json({ route: "r1" }, 200)),
		});
		const r2 = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.json({ route: "r2" }, 200)),
		});

		const { app, testApp } = mountPair((a, h) => a.get("/r1", r1[h]).post("/r2", r2[h]));

		const liveR1 = await app.request("/r1");
		expect(liveR1.status).toBe(200);
		const liveR1Body = await liveR1.json();
		expect(liveR1Body).toEqual({ route: "r1" });

		const liveR2 = await app.request("/r2", { method: "POST" });
		expect(liveR2.status).toBe(200);
		const liveR2Body = await liveR2.json();
		expect(liveR2Body).toEqual({ route: "r2" });

		const testR1 = await testApp.request("/r1");
		expect(testR1.status).toBe(200);
		const testR1Body = await testR1.json();
		expect(testR1Body).toEqual({ route: "r1" });

		const testR2 = await testApp.request("/r2", { method: "POST" });
		expect(testR2.status).toBe(200);
		const testR2Body = await testR2.json();
		expect(testR2Body).toEqual({ route: "r2" });
	});
});

describe("onError handling", () => {
	it("maps typed error to custom response", async () => {
		const { live, test } = route({
			deps: {
				live: Layer.succeed(BizSvc, { tag: "biz" }),
				test: Layer.succeed(BizSvc, { tag: "biz" }),
			},
			onError: (err: Error, c) => c.json({ message: err.message }, 422),
			handler: () => Effect.fail(new Error("custom")),
		});

		const liveApp = new Hono().get("/err", live);
		const liveRes = await liveApp.request("/err");
		expect(liveRes.status).toBe(422);
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ message: "custom" });

		const testApp = new Hono().get("/err", test);
		const testRes = await testApp.request("/err");
		expect(testRes.status).toBe(422);
		const testBody = await testRes.json();
		expect(testBody).toEqual({ message: "custom" });
	});

	it("returns 500 JSON fallback when no onError and effect fails", async () => {
		const { live, test } = route({
			deps: "none",
			handler: () => Effect.fail(new Error("boom")),
		});

		const liveApp = new Hono().get("/boom", live);
		const liveRes = await liveApp.request("/boom");
		expect(liveRes.status).toBe(500);
		const liveBody = await liveRes.json();
		expect(liveBody).toEqual({ error: "Internal Server Error" });

		const testApp = new Hono().get("/boom", test);
		const testRes = await testApp.request("/boom");
		expect(testRes.status).toBe(500);
		const testBody = await testRes.json();
		expect(testBody).toEqual({ error: "Internal Server Error" });
	});
});

describe("route-kit integration", () => {
	it("builds a complete RouteModule<T> with mountPair", async () => {
		const deps = {
			live: Layer.succeed(IntegSvc, { name: "live-svc" }),
			test: Layer.succeed(IntegSvc, { name: "test-svc" }),
		};

		const healthRoute = route({
			deps: "none",
			handler: (c) => Effect.succeed(c.json({ ok: true }, 200)),
		});

		const dataRoute = route({
			deps,
			handler: (c) =>
				Effect.gen(function* () {
					const svc = yield* IntegSvc;
					const cfg = yield* ConfigService;
					const data = yield* cfg.get();
					return c.json({ svc: svc.name, env: data.env }, 200);
				}),
		});

		const { app, testApp } = mountPair<Hono<{ Bindings: AppBindings }>>((a, h) =>
			a.get("/health", healthRoute[h]).get("/data", dataRoute[h]),
		);

		const _module = { app, testApp } satisfies RouteModule<typeof app>;

		const liveHealth = await _module.app.request("/health");
		expect(liveHealth.status).toBe(200);
		const liveHealthBody = await liveHealth.json();
		expect(liveHealthBody).toEqual({ ok: true });

		const liveData = await _module.app.request("/data");
		expect(liveData.status).toBe(200);
		const liveDataBody = await liveData.json();
		expect(liveDataBody).toMatchObject({ svc: "live-svc" });

		const testHealth = await _module.testApp.request("/health");
		expect(testHealth.status).toBe(200);
		const testHealthBody = await testHealth.json();
		expect(testHealthBody).toEqual({ ok: true });

		const testData = await _module.testApp.request("/data");
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
