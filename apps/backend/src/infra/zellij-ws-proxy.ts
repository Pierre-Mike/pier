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
	sessionId: string;
}

// One iframe (re)connect per session. A second upgrade for the same sessionId
// — HMR, double-mount, fast re-open — leaves the prior upstream WS attached to
// zellij's server, so every keystroke reaches the session twice and resize
// storms garble the prompt. Close the stale bridge before installing the new.
const activeBridges = new Map<string, ServerWebSocket<ZellijWsBridge>>();

const sessionIdFromUrl = (url: URL): string => {
	const fromQuery = url.searchParams.get("session");
	if (fromQuery) return fromQuery;
	return url.pathname.split("/").filter(Boolean).at(-1) ?? "";
};

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
	const incomingUrl = new URL(req.url);
	const sessionId = sessionIdFromUrl(incomingUrl);
	const targetUrl = buildTargetWsUrl(incomingUrl, zellijUrl);
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
		sessionId,
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
		const stale = activeBridges.get(ws.data.sessionId);
		if (stale && stale !== ws) {
			const oldUpstream = stale.data.upstream;
			if (oldUpstream) {
				// Detach handlers BEFORE close so the cascade
				// (upstream.onclose → ws.close → iframe reconnect → loop) doesn't fire.
				// Leave the stale downstream alone; the iframe owns it.
				oldUpstream.onclose = null;
				oldUpstream.onerror = null;
				oldUpstream.onmessage = null;
				oldUpstream.onopen = null;
				try {
					oldUpstream.close();
				} catch {
					// already closed — ignore
				}
				stale.data.upstream = null;
			}
		}
		activeBridges.set(ws.data.sessionId, ws);

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
		if (activeBridges.get(ws.data.sessionId) === ws) {
			activeBridges.delete(ws.data.sessionId);
		}
		try {
			ws.data.upstream?.close();
		} catch {
			// upstream already closed — ignore
		}
	},
};
