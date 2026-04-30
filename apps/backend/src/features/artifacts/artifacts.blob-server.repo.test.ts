import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { BlobServer, makeBlobServerTest } from "./artifacts.blob-server.repo.ts";

describe("BlobServer — Test layer", () => {
	it("serves known path with mime + no-store header", async () => {
		const layer = makeBlobServerTest(new Map([["/fake/foo.md", "# hi"]]));
		const program = Effect.gen(function* () {
			const svc = yield* BlobServer;
			return yield* svc.serve("/fake/foo.md");
		});
		const res = await Effect.runPromise(Effect.provide(program, layer));
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(await res.text()).toBe("# hi");
	});

	it("fails for unknown path", async () => {
		const layer = makeBlobServerTest(new Map());
		const program = Effect.gen(function* () {
			const svc = yield* BlobServer;
			return yield* svc.serve("/missing");
		});
		const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
		expect(exit._tag).toBe("Failure");
	});

	it("falls back to binary mime for unknown extension", async () => {
		const layer = makeBlobServerTest(new Map([["/x.unknown", "raw"]]));
		const program = Effect.gen(function* () {
			const svc = yield* BlobServer;
			return yield* svc.serve("/x.unknown");
		});
		const res = await Effect.runPromise(Effect.provide(program, layer));
		expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
	});
});
