import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import app from "./api.ts";

// RED → GREEN: shell/api.ts must never call Effect.runPromise directly.
// Effect lifecycle is owned by effect-handler.ts; api.ts only composes routes.
describe("boundary invariant: no raw Effect.runPromise in api.ts", () => {
	it("shell/api.ts does not contain Effect.runPromise(", async () => {
		const source = await Bun.file(new URL("./api.ts", import.meta.url)).text();
		expect(source).not.toContain("Effect.runPromise(");
	});
});

describe("GET /health", () => {
	it("returns 200 with ok status", async () => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ status: "ok" });
	});
});

describe("structural: all route modules mounted in api.ts", () => {
	it("api.ts imports every route file in shell/routes/", async () => {
		const routesDir = new URL("./routes/", import.meta.url).pathname;
		const entries = await readdir(routesDir);
		// Only consider route module files (not _types, not test files)
		const routeFiles = entries.filter(
			(f) => !f.startsWith("_") && !f.includes(".test") && f.endsWith(".ts"),
		);

		const source = await Bun.file(new URL("./api.ts", import.meta.url)).text();

		for (const file of routeFiles) {
			const moduleName = file.replace(".ts", "");
			expect(source, `api.ts should import from ./routes/${moduleName}.ts`).toContain(
				`./routes/${moduleName}.ts`,
			);
		}
	});
});
