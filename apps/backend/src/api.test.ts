import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import app from "./api.ts";

// api.ts must never call Effect.runPromise directly. Effect lifecycle is owned
// by effect-handler.ts; api.ts only composes routes.
describe("boundary invariant: no raw Effect.runPromise in api.ts", () => {
	it("api.ts does not contain Effect.runPromise(", async () => {
		const source = await Bun.file(new URL("./api.ts", import.meta.url)).text();
		expect(source).not.toContain("Effect.runPromise(");
	});
});

describe("GET /health", () => {
	it("returns 200 with ok status", async () => {
		const res = await app.request("/health", { headers: { host: "127.0.0.1" } });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ status: "ok" });
	});
});

describe("structural: all route modules mounted in api.ts", () => {
	it("api.ts imports every features/<name>/<name>*.routes.ts file", async () => {
		const source = await Bun.file(new URL("./api.ts", import.meta.url)).text();
		const featuresDir = new URL("./features/", import.meta.url).pathname;
		const featureNames = await readdir(featuresDir).catch(() => [] as string[]);
		for (const feature of featureNames) {
			const featureDir = `${featuresDir}${feature}/`;
			const files = await readdir(featureDir).catch(() => [] as string[]);
			const routesFiles = files.filter((f) => f.endsWith(".routes.ts") && !f.includes(".test"));
			for (const file of routesFiles) {
				const importPath = `./features/${feature}/${file}`;
				expect(source, `api.ts should import from ${importPath}`).toContain(importPath);
			}
		}
	});
});
