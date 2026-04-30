/**
 * Reverse-proxy mounted at /zellij/* — forwards HTTP requests to the local
 * zellij web server (default https://127.0.0.1:8082) so the iframe inside
 * pier loads from the same origin as the backend.
 *
 * Why a proxy:
 *  - zellij web sends `X-Frame-Options: DENY`, which would break embedding.
 *    The proxy strips it.
 *  - zellij requires a session cookie obtained via /command/login. The proxy
 *    holds the cookie server-side (see zellij-auth.ts) so the iframe never
 *    sees a login prompt.
 *  - zellij listens over HTTPS with a self-signed cert. The proxy speaks
 *    HTTPS upstream and serves plain HTTP downstream, so no cert-trust UX.
 *
 * WebSocket upgrades (/zellij/ws/...) are handled at the Bun.serve layer in
 * main.ts, not here — Hono routing is HTTP-only.
 */
import { Hono } from "hono";
import { clearZellijCookie, ensureZellijWeb, getZellijCookie } from "../../infra/zellij-auth.ts";
import type { AppBindings } from "../../platform/bindings.ts";
import { injectPaletteRelay } from "../zellij-wrapper.ts";

const STRIPPED_RESPONSE_HEADERS = new Set([
	"x-frame-options",
	"content-security-policy",
	"content-security-policy-report-only",
	"strict-transport-security",
]);

const upstreamUrl = (): string => process.env["PIGUY_ZELLIJ_URL"] ?? "https://127.0.0.1:8082";

const buildTargetUrl = (incoming: URL, upstream: URL): URL => {
	const target = new URL(upstream.toString());
	const trimmed = incoming.pathname.replace(/^\/zellij/, "");
	target.pathname = trimmed.length > 0 ? trimmed : "/";
	target.search = incoming.search;
	return target;
};

const buildUpstreamInit = async ({
	req,
	target,
	cookie,
}: {
	req: Request;
	target: URL;
	cookie: string;
}): Promise<RequestInit> => {
	const headers = new Headers(req.headers);
	headers.set("Cookie", cookie);
	headers.set("Host", target.host);
	headers.delete("accept-encoding");
	const init: RequestInit = {
		method: req.method,
		headers,
		redirect: "manual",
		// @ts-expect-error tls is a Bun fetch option
		tls: { rejectUnauthorized: false },
	};
	if (req.method !== "GET" && req.method !== "HEAD") {
		init.body = await req.arrayBuffer();
	}
	return init;
};

const buildResponseHeaders = (upstream: Response): Headers => {
	const out = new Headers();
	upstream.headers.forEach((value, key) => {
		if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
			out.append(key, value);
		}
	});
	return out;
};

const upstreamUnavailable = (target: URL, cause: unknown): Response => {
	const message = cause instanceof Error ? cause.message : String(cause);
	return new Response(`zellij upstream unavailable: ${target.host} — ${message}`, {
		status: 502,
		headers: { "Content-Type": "text/plain" },
	});
};

const isConnectError = (err: unknown): boolean => {
	const msg = err instanceof Error ? err.message : String(err);
	return /ECONNREFUSED|ConnectionRefused|fetch failed|Unable to connect/i.test(msg);
};

const proxyHttp = async (req: Request): Promise<Response> => {
	const zellijUrl = upstreamUrl();
	const target = buildTargetUrl(new URL(req.url), new URL(zellijUrl));

	const acquireCookie = async (): Promise<string> => {
		try {
			return await getZellijCookie(zellijUrl);
		} catch (err) {
			if (!isConnectError(err)) throw err;
			await ensureZellijWeb(zellijUrl);
			clearZellijCookie();
			return getZellijCookie(zellijUrl, true);
		}
	};

	let cookie: string;
	try {
		cookie = await acquireCookie();
	} catch (err) {
		return upstreamUnavailable(target, err);
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, await buildUpstreamInit({ req, target, cookie }));
	} catch (err) {
		if (!isConnectError(err)) return upstreamUnavailable(target, err);
		try {
			await ensureZellijWeb(zellijUrl);
			upstream = await fetch(target, await buildUpstreamInit({ req, target, cookie }));
		} catch (retryErr) {
			return upstreamUnavailable(target, retryErr);
		}
	}
	if (upstream.status === 401) {
		clearZellijCookie();
		try {
			const fresh = await getZellijCookie(zellijUrl, true);
			upstream = await fetch(target, await buildUpstreamInit({ req, target, cookie: fresh }));
		} catch (err) {
			return upstreamUnavailable(target, err);
		}
	}

	const headers = buildResponseHeaders(upstream);
	const contentType = upstream.headers.get("content-type") ?? "";
	if (contentType.includes("text/html")) {
		// Re-base relative URLs so the proxied client resolves assets/WS through /zellij/.
		// Inject the palette postMessage relay so Shift keydowns inside the iframe
		// are forwarded to the parent window (spec 010, Decision 1).
		const rebased = (await upstream.text()).replace(
			/<base href="\/" \/>/,
			'<base href="/zellij/" />',
		);
		const body = injectPaletteRelay(rebased);
		headers.delete("content-length");
		return new Response(body, { status: upstream.status, headers });
	}

	return new Response(upstream.body, { status: upstream.status, headers });
};

const app = new Hono<{ Bindings: AppBindings }>().all("/zellij/*", (c) => proxyHttp(c.req.raw));

export const zellijProxyRoute = { app };
