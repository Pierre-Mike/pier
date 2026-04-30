/**
 * Integration gate for spec 002 slice 2 — settings route (RED).
 *
 * This file imports from ./settings (which does not exist yet) and asserts a
 * compile-time AppType shape that is not yet wired in ../api.ts.  Every test
 * block will fail until the spec-implementer creates the route and updates api.ts.
 *
 * Mock strategy:
 *   - mock.module replaces ../../infra/zellij-auth so no real zellij binary or
 *     disk access occurs.
 *   - process.env.PIGUY_ZELLIJ_URL is set/cleared per test to exercise the
 *     fallback URL behaviour.
 *   - localhostGuard is exercised directly on settingsRoute.testApp by sending
 *     requests with a non-loopback Host header.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { hc } from "hono/client";
import type { AppType } from "../../api.ts";

// ---------------------------------------------------------------------------
// Stub getZellijReadOnlyToken — must be registered before the subject import.
// ---------------------------------------------------------------------------

let mockTokenValue = "ro_tok_test_default";
let mockTokenError: Error | null = null;

mock.module("../../infra/zellij-auth.ts", () => ({
	getZellijReadOnlyToken: async (): Promise<string> => {
		if (mockTokenError) throw mockTokenError;
		return mockTokenValue;
	},
}));

// ---------------------------------------------------------------------------
// Subject import — this module does not exist yet; the import will fail at
// runtime (RED) until the implementer creates settings.ts.
// ---------------------------------------------------------------------------
import { settingsRoute } from "./settings.ts";

// ---------------------------------------------------------------------------
// Compile-time AppType assertion.
// The type `_SettingsClientShape` must resolve to a callable.  Since
// settingsRoute is not yet composed into AppType in ../api.ts, TypeScript
// cannot resolve `client.settings["zellij-readonly"].$get` and will emit a
// type error — that is the RED signal for this AC.
// ---------------------------------------------------------------------------
type _BackendClient = ReturnType<typeof hc<AppType>>;
// @ts-expect-error — settingsRoute not yet in AppType; remove this directive once implemented
type _SettingsClientShape = _BackendClient["settings"]["zellij-readonly"]["$get"];

// ---------------------------------------------------------------------------

const DEFAULT_ZELLIJ_ORIGIN = "https://127.0.0.1:8082";

beforeEach(() => {
	mockTokenValue = "ro_tok_test_default";
	mockTokenError = null;
	// Remove the env override so tests default to the built-in origin.
	delete process.env["PIGUY_ZELLIJ_URL"];
});

// ---------------------------------------------------------------------------
// AC-1: shape — GET /settings/zellij-readonly returns { url, tokenName }
// ---------------------------------------------------------------------------
describe("GET /settings/zellij-readonly — response shape", () => {
	it("returns 200 with readonly/watch-only metadata", async () => {
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body["access"]).toBe("read-only");
		expect(body["mode"]).toBe("watch");
		expect(typeof body["url"]).toBe("string");
		expect(body["tokenName"]).toBe("zellij-readonly-token");
	});
});

// ---------------------------------------------------------------------------
// AC-2: url contains #token=<readonly-token> fragment
// ---------------------------------------------------------------------------
describe("GET /settings/zellij-readonly — url fragment", () => {
	it("returned url ends with #token=<readonly-token>", async () => {
		mockTokenValue = "ro_tok_frag_check";
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			access: string;
			mode: string;
			url: string;
			tokenName: string;
		};
		expect(body.access).toBe("read-only");
		expect(body.mode).toBe("watch");
		expect(body.url).toContain("#token=ro_tok_frag_check");
	});

	it("url base is the default zellij web origin when PIGUY_ZELLIJ_URL is unset", async () => {
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url: string };
		expect(body.url.startsWith(DEFAULT_ZELLIJ_ORIGIN)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-3: PIGUY_ZELLIJ_URL env override
// ---------------------------------------------------------------------------
describe("GET /settings/zellij-readonly — PIGUY_ZELLIJ_URL fallback", () => {
	it("uses PIGUY_ZELLIJ_URL as base when set", async () => {
		process.env["PIGUY_ZELLIJ_URL"] = "https://192.168.1.42:8082";
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url: string };
		expect(body.url.startsWith("https://192.168.1.42:8082")).toBe(true);
	});

	it("still appends the #token fragment when PIGUY_ZELLIJ_URL is set", async () => {
		process.env["PIGUY_ZELLIJ_URL"] = "https://192.168.1.42:8082";
		mockTokenValue = "ro_tok_env_var";
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url: string };
		expect(body.url).toContain("#token=ro_tok_env_var");
	});
});

// ---------------------------------------------------------------------------
// AC-5: localhostGuard rejects non-loopback origin on the settings route
// ---------------------------------------------------------------------------
describe("GET /settings/zellij-readonly — localhostGuard", () => {
	it("returns 403 when Host header is a non-loopback hostname", async () => {
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly", {
			headers: { host: "evil.example.com" },
		});
		expect(res.status).toBe(403);
	});

	it("returns 200 when Host header is 127.0.0.1", async () => {
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly", {
			headers: { host: "127.0.0.1:5273" },
		});
		expect(res.status).toBe(200);
	});

	it("returns 200 when Host header is localhost", async () => {
		const res = await settingsRoute.testApp.request("/settings/zellij-readonly", {
			headers: { host: "localhost:5273" },
		});
		expect(res.status).toBe(200);
	});
});
