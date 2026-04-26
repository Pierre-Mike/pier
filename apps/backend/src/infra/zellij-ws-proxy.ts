/**
 * WebSocket bridge for /zellij/ws/* — pairs a downstream Bun
 * `ServerWebSocket` (the iframe client) with an upstream `WebSocket`
 * connected to the local zellij web server, copying frames in both
 * directions and authenticating with the cached session cookie.
 *
 * Lives in infra/ because Hono cannot mount Bun WebSocket handlers — the
 * upgrade has to happen at the Bun.serve layer (see main.ts).
 */
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { clearZellijCookie, ensureZellijWeb, getZellijCookie } from "./zellij-auth.ts";

export interface ZellijWsBridge {
	cookie: string;
	targetUrl: string;
	upstream: WebSocket | null;
	upBuffer: Array<string | ArrayBuffer | Uint8Array>;
}

const buildTargetWsUrl = (incoming: URL, zellijUrl: string): string => {
	const target = new URL(zellijUrl);
	target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
	const trimmed = incoming.pathname.replace(/^\/zellij/, "");
	target.pathname = trimmed.length > 0 ? trimmed : "/";
	target.search = incoming.search;
	return target.toString();
};

export const handleZellijWsUpgrade = async ({
	req,
	server,
	zellijUrl,
}: {
	req: Request;
	server: Server<ZellijWsBridge>;
	zellijUrl: string;
}): Promise<Response | undefined> => {
	const targetUrl = buildTargetWsUrl(new URL(req.url), zellijUrl);
	let cookie: string;
	try {
		cookie = await getZellijCookie(zellijUrl);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (!/ECONNREFUSED|ConnectionRefused|fetch failed|Unable to connect/i.test(msg)) {
			return new Response(`zellij ws auth failed: ${msg}`, { status: 502 });
		}
		try {
			await ensureZellijWeb(zellijUrl);
			clearZellijCookie();
			cookie = await getZellijCookie(zellijUrl, true);
		} catch (retryErr) {
			const m = retryErr instanceof Error ? retryErr.message : String(retryErr);
			return new Response(`zellij upstream unavailable: ${m}`, { status: 502 });
		}
	}

	const data: ZellijWsBridge = {
		cookie,
		targetUrl,
		upstream: null,
		upBuffer: [],
	};

	const ok = server.upgrade(req, { data });
	if (!ok) {
		return new Response("zellij ws upgrade failed", { status: 500 });
	}
	return undefined;
};

const toClientFrame = (data: unknown): string | ArrayBuffer => {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return data;
	if (data instanceof Uint8Array) {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	}
	throw new Error("unexpected upstream frame type");
};

export const zellijWsHandlers: WebSocketHandler<ZellijWsBridge> = {
	open(ws: ServerWebSocket<ZellijWsBridge>) {
		const upstream = new WebSocket(ws.data.targetUrl, {
			tls: { rejectUnauthorized: false },
			headers: { Cookie: ws.data.cookie },
		});
		upstream.binaryType = "arraybuffer";
		ws.data.upstream = upstream;

		upstream.onopen = () => {
			for (const m of ws.data.upBuffer) upstream.send(m);
			ws.data.upBuffer.length = 0;
		};
		upstream.onmessage = (e: MessageEvent) => {
			ws.send(toClientFrame(e.data));
		};
		upstream.onclose = () => {
			ws.close();
		};
		upstream.onerror = () => {
			ws.close();
		};
	},
	message(ws: ServerWebSocket<ZellijWsBridge>, msg: string | Buffer) {
		const upstream = ws.data.upstream;
		const frame: string | ArrayBuffer | Uint8Array =
			typeof msg === "string" ? msg : new Uint8Array(msg);
		if (upstream && upstream.readyState === WebSocket.OPEN) {
			upstream.send(frame);
		} else {
			ws.data.upBuffer.push(frame);
		}
	},
	close(ws: ServerWebSocket<ZellijWsBridge>) {
		try {
			ws.data.upstream?.close();
		} catch {
			// upstream already closed — ignore
		}
	},
};
