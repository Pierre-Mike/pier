import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { reloadBusInstance } from "../../infra/sse-bus.ts";
import { streamReloadRoute } from "./stream-reload.ts";

const reset = (): void => {
	const ref = reloadBusInstance as unknown as { subs: Set<unknown>; history: unknown[] };
	ref.subs.clear();
	ref.history.length = 0;
};

describe("GET /api/stream/reload", () => {
	beforeEach(reset);
	afterEach(reset);

	it("opens an SSE stream and writes a 'reload' event with the changed path", async () => {
		const res = await streamReloadRoute.app.request("/api/stream/reload", {
			headers: { host: "127.0.0.1" },
		});
		expect(res.status).toBe(200);
		const reader = res.body?.getReader();
		if (!reader) throw new Error("no body reader");
		reloadBusInstance.emit("public/app.js");
		const decoder = new TextDecoder();
		const chunk = await reader.read();
		const text = decoder.decode(chunk.value ?? new Uint8Array());
		expect(text).toContain("event: reload");
		expect(text).toContain("data: public/app.js");
		await reader.cancel();
	});
});
