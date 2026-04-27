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

// ---------------------------------------------------------------------------
// Structured-log channel
// ---------------------------------------------------------------------------

export type BridgeLogEvent =
	| { kind: "bridge:upgrade"; sessionId: string; activeBridges: number }
	| { kind: "bridge:open"; sessionId: string; upstreamReadyState: number }
	| { kind: "bridge:close"; sessionId: string; reason: string };

type BridgeLogSubscriber = (evt: BridgeLogEvent) => void;

/**
 * Observable log channel — subscribers receive structured lifecycle events.
 * Each call to subscribe adds a new listener; there is no deduplication.
 */
export const bridgeLog = {
	_subscribers: [] as BridgeLogSubscriber[],
	subscribe(fn: BridgeLogSubscriber): void {
		this._subscribers.push(fn);
	},
	emit(evt: BridgeLogEvent): void {
		for (const fn of this._subscribers) {
			fn(evt);
		}
	},
};

// ---------------------------------------------------------------------------
// Active-bridges registry
// ---------------------------------------------------------------------------

/** Maps sessionId → active downstream ServerWebSocket. Exported for tests. */
export const activeBridges = new Map<string, ServerWebSocket<ZellijWsBridge>>();

// ---------------------------------------------------------------------------
// Bridge data type
// ---------------------------------------------------------------------------

export interface ZellijWsBridge {
	cookie: string;
	targetUrl: string;
	upstream: WebSocket | null;
	upBuffer: Array<string | ArrayBuffer | Uint8Array>;
	sessionId: string;
}

// ---------------------------------------------------------------------------
// Auth dependencies (injectable for testing)
// ---------------------------------------------------------------------------

export interface ZellijAuthDeps {
	getCookie: (url: string, force?: boolean) => Promise<string>;
	ensureWeb: (url: string) => Promise<void>;
	clearCookie: () => void;
}

/**
 * Wraps ensureZellijWeb with a 2-second deadline using an unref'd timer so
 * the deadline never keeps the event loop alive in test environments.
 */
const ensureZellijWebWithTimeout = (zellijUrl: string): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("zellij web did not become reachable in time"));
		}, 2000);
		// unref so the timer does not prevent the process / test runner from
		// exiting if nothing else is pending.
		if (typeof (timer as unknown as { unref?: () => void }).unref === "function") {
			(timer as unknown as { unref: () => void }).unref();
		}
		ensureZellijWeb(zellijUrl).then(
			() => {
				clearTimeout(timer);
				resolve();
			},
			(err: unknown) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});

export const defaultAuthDeps: ZellijAuthDeps = {
	getCookie: getZellijCookie,
	ensureWeb: ensureZellijWebWithTimeout,
	clearCookie: clearZellijCookie,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildTargetWsUrl = (incoming: URL, zellijUrl: string): string => {
	const target = new URL(zellijUrl);
	target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
	const trimmed = incoming.pathname.replace(/^\/zellij/, "");
	target.pathname = trimmed.length > 0 ? trimmed : "/";
	target.search = incoming.search;
	return target.toString();
};

// ---------------------------------------------------------------------------
// Upgrade handler
// ---------------------------------------------------------------------------

export const handleZellijWsUpgrade = async ({
	req,
	server,
	zellijUrl,
	_authDeps = defaultAuthDeps,
}: {
	req: Request;
	server: Server<ZellijWsBridge>;
	zellijUrl: string;
	_authDeps?: ZellijAuthDeps;
}): Promise<Response | undefined> => {
	const incomingUrl = new URL(req.url);
	const sessionId =
		incomingUrl.searchParams.get("session") ?? incomingUrl.pathname.split("/").at(-1) ?? "";
	const targetUrl = buildTargetWsUrl(incomingUrl, zellijUrl);

	// Emit bridge:upgrade BEFORE the async cookie fetch so auth failures are
	// still observable in the log.
	bridgeLog.emit({ kind: "bridge:upgrade", sessionId, activeBridges: activeBridges.size });

	let cookie: string;
	try {
		cookie = await _authDeps.getCookie(zellijUrl);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (!/ECONNREFUSED|ConnectionRefused|fetch failed|Unable to connect/i.test(msg)) {
			return new Response(`zellij ws auth failed: ${msg}`, { status: 502 });
		}
		try {
			await _authDeps.ensureWeb(zellijUrl);
			_authDeps.clearCookie();
			cookie = await _authDeps.getCookie(zellijUrl, true);
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

// ---------------------------------------------------------------------------
// Frame helper
// ---------------------------------------------------------------------------

const toClientFrame = (data: unknown): string | ArrayBuffer => {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return data;
	if (data instanceof Uint8Array) {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	}
	throw new Error("unexpected upstream frame type");
};

// ---------------------------------------------------------------------------
// WS handlers
// ---------------------------------------------------------------------------

export const zellijWsHandlers: WebSocketHandler<ZellijWsBridge> = {
	open(ws: ServerWebSocket<ZellijWsBridge>) {
		// Close stale upstream for duplicate sessionId before installing new one.
		const stale = activeBridges.get(ws.data.sessionId);
		if (stale !== undefined) {
			try {
				stale.data.upstream?.close();
			} catch {
				// stale upstream already closed — ignore
			}
			bridgeLog.emit({
				kind: "bridge:close",
				sessionId: ws.data.sessionId,
				reason: "stale-replaced",
			});
		}

		// globalThis.WebSocket must be read at call time (not import time) so
		// tests can patch it via globalThis.
		const WS = globalThis.WebSocket;
		const upstream = new WS(ws.data.targetUrl, {
			headers: { Cookie: ws.data.cookie },
		} as unknown as string[]) as WebSocket;
		upstream.binaryType = "arraybuffer";
		ws.data.upstream = upstream;

		// Track active bridge
		activeBridges.set(ws.data.sessionId, ws);

		// Emit bridge:open with the upstream's readyState at construction time
		bridgeLog.emit({
			kind: "bridge:open",
			sessionId: ws.data.sessionId,
			upstreamReadyState: upstream.readyState,
		});

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
		// Remove from active bridges
		activeBridges.delete(ws.data.sessionId);

		bridgeLog.emit({
			kind: "bridge:close",
			sessionId: ws.data.sessionId,
			reason: "downstream closed",
		});

		try {
			ws.data.upstream?.close();
		} catch {
			// upstream already closed — ignore
		}
	},

	error(ws: ServerWebSocket<ZellijWsBridge>, error: Error) {
		// Remove from active bridges
		activeBridges.delete(ws.data.sessionId);

		bridgeLog.emit({
			kind: "bridge:close",
			sessionId: ws.data.sessionId,
			reason: `upstream error: ${error.message}`,
		});

		try {
			ws.data.upstream?.close();
		} catch {
			// upstream already closed — ignore
		}
	},
};
