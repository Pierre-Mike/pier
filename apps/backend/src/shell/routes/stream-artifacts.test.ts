import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { artifactBusInstance } from "../../infra/sse-bus.ts";
import { streamArtifactsRoute } from "./stream-artifacts.ts";

const reset = (): void => {
	const ref = artifactBusInstance as unknown as { subs: Set<unknown>; history: unknown[] };
	ref.subs.clear();
	ref.history.length = 0;
};

describe("GET /api/stream/artifacts", () => {
	beforeEach(reset);
	afterEach(reset);

	it("opens an SSE stream and emits named events per ArtifactEvent.kind", async () => {
		const res = await streamArtifactsRoute.app.request("/api/stream/artifacts", {
			headers: { host: "127.0.0.1" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const reader = res.body?.getReader();
		if (!reader) throw new Error("no body reader");
		artifactBusInstance.emit({ kind: "add", artifact: null, id: "x" });
		const decoder = new TextDecoder();
		const chunk = await reader.read();
		const text = decoder.decode(chunk.value ?? new Uint8Array());
		expect(text).toContain("event: add");
		expect(text).toContain('"id":"x"');
		await reader.cancel();
	});
});
