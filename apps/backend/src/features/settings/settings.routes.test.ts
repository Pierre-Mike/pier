/**
 * Integration tests for settings.routes — zellij-readonly endpoint.
 *
 * The zellij read-only token is supplied via Effect's Layer system, not
 * mock.module. The TestLayer below closes over module-scoped `stubToken` /
 * `stubError` lets so individual tests can vary the stubbed behaviour by
 * mutating those values, while `beforeEach` resets them. This avoids the
 * specifier-keyed mock.module leak that previously contaminated other suites.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import type { hc } from "hono/client";
import type { AppType } from "../../api.ts";
import { ZellijAuthError, ZellijAuthService } from "../zellij/zellij.auth.repo.ts";
import { buildSettingsTestApp, settingsRoute } from "./settings.routes.ts";

// ---------------------------------------------------------------------------
// Test layer — closure-reads from module-scoped lets so tests can vary the
// stubbed token / error without rebuilding the Hono app per case.
// ---------------------------------------------------------------------------

let stubToken = "ro_tok_test_default";
let stubError: Error | null = null;

const TestLayer: Layer.Layer<ZellijAuthService> = Layer.succeed(ZellijAuthService, {
	getReadOnlyToken: () =>
		stubError !== null
			? Effect.fail(new ZellijAuthError({ cause: stubError }))
			: Effect.succeed(stubToken),
});

const testApp = buildSettingsTestApp(TestLayer);

// ---------------------------------------------------------------------------
// Compile-time AppType assertion — settingsRoute must be wired into AppType.
// ---------------------------------------------------------------------------
type _BackendClient = ReturnType<typeof hc<AppType>>;
type _SettingsClientShape = _BackendClient["settings"]["zellij-readonly"]["$get"];

// Reference exports so unused-symbol checks stay satisfied without runtime cost.
void settingsRoute;
const _checkClientShape: _SettingsClientShape | undefined = undefined;
void _checkClientShape;

// ---------------------------------------------------------------------------

const DEFAULT_ZELLIJ_ORIGIN = "https://127.0.0.1:8082";

beforeEach(() => {
	stubToken = "ro_tok_test_default";
	stubError = null;
	delete process.env["PIGUY_ZELLIJ_URL"];
});

// ---------------------------------------------------------------------------
// AC-1: shape — GET /settings/zellij-readonly returns { url, tokenName }
// ---------------------------------------------------------------------------
describe("GET /settings/zellij-readonly — response shape", () => {
	it("returns 200 with readonly/watch-only metadata", async () => {
		const res = await testApp.request("/settings/zellij-readonly");
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
		stubToken = "ro_tok_frag_check";
		const res = await testApp.request("/settings/zellij-readonly");
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
		const res = await testApp.request("/settings/zellij-readonly");
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
		const res = await testApp.request("/settings/zellij-readonly");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url: string };
		expect(body.url.startsWith("https://192.168.1.42:8082")).toBe(true);
	});

	it("still appends the #token fragment when PIGUY_ZELLIJ_URL is set", async () => {
		process.env["PIGUY_ZELLIJ_URL"] = "https://192.168.1.42:8082";
		stubToken = "ro_tok_env_var";
		const res = await testApp.request("/settings/zellij-readonly");
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
		const res = await testApp.request("/settings/zellij-readonly", {
			headers: { host: "evil.example.com" },
		});
		expect(res.status).toBe(403);
	});

	it("returns 200 when Host header is 127.0.0.1", async () => {
		const res = await testApp.request("/settings/zellij-readonly", {
			headers: { host: "127.0.0.1:5273" },
		});
		expect(res.status).toBe(200);
	});

	it("returns 200 when Host header is localhost", async () => {
		const res = await testApp.request("/settings/zellij-readonly", {
			headers: { host: "localhost:5273" },
		});
		expect(res.status).toBe(200);
	});
});
