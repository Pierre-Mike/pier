/**
 * TDD: RED phase — tests written before any implementation.
 * Each describe block maps to one red-green-refactor cycle.
 */
import { describe, expect, it } from "bun:test";

// --- Cycle 1: createBackendClient is exported and callable ---
describe("createBackendClient", () => {
	it("is a function", async () => {
		const { createBackendClient } = await import("./index.ts");
		expect(typeof createBackendClient).toBe("function");
	});

	// --- Cycle 2: returns a client with health and version routes ---
	// hc() returns a Proxy so properties are only accessible via direct access, not hasOwnProperty
	it("returns an object with health and version properties", async () => {
		const { createBackendClient } = await import("./index.ts");
		const client = createBackendClient("http://localhost:8787");
		expect(client.health).toBeDefined();
		expect(client.version).toBeDefined();
	});

	// --- Cycle 3: route objects expose a callable $get ---
	it("health.$get is a function", async () => {
		const { createBackendClient } = await import("./index.ts");
		const client = createBackendClient("http://localhost:8787");
		expect(typeof client.health.$get).toBe("function");
	});

	it("version.$get is a function", async () => {
		const { createBackendClient } = await import("./index.ts");
		const client = createBackendClient("http://localhost:8787");
		expect(typeof client.version.$get).toBe("function");
	});
});
