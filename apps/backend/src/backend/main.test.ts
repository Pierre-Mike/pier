import { describe, expect, it } from "bun:test";
import app from "./main.ts";

describe("main", () => {
	it("exports a Hono app with a fetch handler", () => {
		expect(app).toBeDefined();
		expect(typeof app.fetch).toBe("function");
	});
});
