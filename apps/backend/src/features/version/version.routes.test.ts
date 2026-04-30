import { describe, expect, it } from "bun:test";
import { versionRoute } from "./version.routes.ts";

describe("GET /version via versionRoute.testApp (isolated)", () => {
	it("returns 200 with version shape", async () => {
		const res = await versionRoute.testApp.request("/version");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ version: "0.0.0", env: "test" });
	});
});
