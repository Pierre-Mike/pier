import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { Hono } from "hono";
import { ConfigService, ConfigTest, makeConfigLayer } from "../infra/config.ts";
import { defineRoute } from "./effect-handler.ts";

describe("defineRoute", () => {
	describe("factory deps", () => {
		it("runs the effect with a per-request layer factory", async () => {
			const handler = defineRoute<ConfigService>({
				deps: () => ConfigTest,
				handler: (c) =>
					Effect.gen(function* () {
						const svc = yield* ConfigService;
						const data = yield* svc.get();
						return c.json(data, 200);
					}),
			});

			const testApp = new Hono().get("/test", handler);
			const res = await testApp.request("/test");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ version: "0.0.0", env: "test" });
		});

		it("forwards c.env to the per-request factory", async () => {
			const handler = defineRoute<ConfigService>({
				deps: (c) => makeConfigLayer(c.env as { ENVIRONMENT?: string }),
				handler: (c) =>
					Effect.gen(function* () {
						const svc = yield* ConfigService;
						const data = yield* svc.get();
						return c.json(data, 200);
					}),
			});

			const testApp = new Hono<{ Bindings: { ENVIRONMENT?: string } }>().get("/test", handler);
			const res = await testApp.request("/test", {}, { ENVIRONMENT: "staging" });
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ version: "0.0.0", env: "staging" });
		});
	});

	describe("static deps", () => {
		it("runs the effect with a static layer", async () => {
			const handler = defineRoute<ConfigService>({
				deps: ConfigTest,
				handler: (c) =>
					Effect.gen(function* () {
						const svc = yield* ConfigService;
						const data = yield* svc.get();
						return c.json(data, 200);
					}),
			});

			const testApp = new Hono().get("/test", handler);
			const res = await testApp.request("/test");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ version: "0.0.0", env: "test" });
		});
	});

	describe("no deps (R = never)", () => {
		it("runs the effect without any layer", async () => {
			const handler = defineRoute({
				handler: (c) => Effect.succeed(c.json({ ok: true }, 200)),
			});

			const testApp = new Hono().get("/test", handler);
			const res = await testApp.request("/test");
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true });
		});
	});

	describe("onError", () => {
		it("maps a typed error to a custom response", async () => {
			const handler = defineRoute<ConfigService, Error>({
				deps: () => ConfigTest,
				onError: (err, c) => c.json({ message: err.message }, 422),
				handler: () => Effect.fail(new Error("custom")),
			});

			const testApp = new Hono().get("/test", handler);
			const res = await testApp.request("/test");
			expect(res.status).toBe(422);
			const body = await res.json();
			expect(body).toEqual({ message: "custom" });
		});

		it("returns 500 JSON when no onError and effect fails", async () => {
			const handler = defineRoute<ConfigService, Error>({
				deps: () => ConfigTest,
				handler: () => Effect.fail(new Error("boom")),
			});

			const testApp = new Hono().get("/test", handler);
			const res = await testApp.request("/test");
			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body).toEqual({ error: "Internal Server Error" });
		});
	});
});
