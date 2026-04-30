import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { eventBusInstance } from "../../platform/sse-bus.ts";
import { streamEventsRoute } from "./events.stream.routes.ts";

const reset = (): void => {
	const ref = eventBusInstance as unknown as { subs: Set<unknown>; history: unknown[] };
	ref.subs.clear();
	ref.history.length = 0;
};

describe("GET /api/stream/events", () => {
	beforeEach(reset);
	afterEach(reset);

	it("opens an SSE stream and writes emitted events as default messages", async () => {
		const res = await streamEventsRoute.app.request("/api/stream/events", {
			headers: { host: "127.0.0.1" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const reader = res.body?.getReader();
		if (!reader) throw new Error("no body reader");
		eventBusInstance.emit({ ts: 1, project: "p", kind: "claude:text", text: "hi" });
		const decoder = new TextDecoder();
		const chunk = await reader.read();
		const text = decoder.decode(chunk.value ?? new Uint8Array());
		expect(text).toContain("data: ");
		expect(text).toContain('"kind":"claude:text"');
		await reader.cancel();
	});
});
