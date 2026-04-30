import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { artifactBusInstance } from "../../infra/sse-bus.ts";
import type { AppBindings } from "../../platform/bindings.ts";
import type { RouteModule } from "../../platform/route-types.ts";

const KEEPALIVE_MS = 15_000;
const HOLD_OPEN_MS = 60_000;

const buildApp = () =>
	new Hono<{ Bindings: AppBindings }>().get("/api/stream/artifacts", (c) =>
		streamSSE(c, async (stream) => {
			const off = artifactBusInstance.subscribe((evt) => {
				void stream.writeSSE({ event: evt.kind, data: JSON.stringify(evt) });
			});
			const ka = setInterval(() => {
				void stream.writeSSE({ event: "ping", data: String(Date.now()) });
			}, KEEPALIVE_MS);
			stream.onAbort(() => {
				off();
				clearInterval(ka);
			});
			while (!stream.closed) {
				await stream.sleep(HOLD_OPEN_MS);
			}
		}),
	);

const app = buildApp();
const testApp = buildApp();

export const streamArtifactsRoute = { app, testApp } satisfies RouteModule<typeof app>;
