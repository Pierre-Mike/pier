import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { Context, Data, Effect, Layer } from "effect";
import { classify } from "./artifacts.blob-classify.core.ts";

export class BlobError extends Data.TaggedError("BlobError")<{ message: string }> {}

export interface BlobServer {
	readonly serve: (absPath: string) => Effect.Effect<Response, BlobError, never>;
}

export const BlobServer = Context.GenericTag<BlobServer>("BlobServer");

export const makeBlobServerLive = (): Layer.Layer<BlobServer> =>
	Layer.succeed(BlobServer, {
		serve: (absPath) =>
			Effect.try({
				try: () => {
					const { mime } = classify(absPath);
					const stream = createReadStream(absPath);
					const web = Readable.toWeb(stream) as ReadableStream;
					return new Response(web, {
						status: 200,
						headers: {
							"Content-Type": mime,
							"Cache-Control": "no-store",
						},
					});
				},
				catch: () => new BlobError({ message: "not found" }),
			}),
	});

export const makeBlobServerTest = (bodies: ReadonlyMap<string, string>): Layer.Layer<BlobServer> =>
	Layer.succeed(BlobServer, {
		serve: (absPath) => {
			const body = bodies.get(absPath);
			if (body === undefined) {
				return Effect.fail(new BlobError({ message: "not found" }));
			}
			const { mime } = classify(absPath);
			return Effect.succeed(
				new Response(body, {
					status: 200,
					headers: { "Content-Type": mime, "Cache-Control": "no-store" },
				}),
			);
		},
	});
