import type { Context, MiddlewareHandler } from "hono";
import { getDynamicAllowedHost } from "../infra/cloudflared.ts";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const EXTRA_HOSTS = (process.env["PIGUY_ALLOWED_HOSTS"] ?? "")
	.split(",")
	.map((h) => h.trim().toLowerCase())
	.filter(Boolean);

const matchHost = (host: string): "loopback" | "extra" | null => {
	if (ALLOWED_HOSTS.has(host)) return "loopback";
	const matched = EXTRA_HOSTS.some((entry) =>
		entry.startsWith("*.") ? host.endsWith(entry.slice(1)) : entry === host,
	);
	if (matched) return "extra";
	const dynamic = getDynamicAllowedHost();
	if (dynamic && dynamic === host) return "extra";
	return null;
};

// Stricter than localhostGuard: ignores the dynamic tunnel host so endpoints
// that control the tunnel itself (start/stop) are reachable only from the
// machine running pier. Use on routes that should never be exposed publicly
// even while a tunnel is active.
export const strictLoopbackGuard: MiddlewareHandler = async (c, next) => {
	const rawHost = c.req.header("host") ?? "";
	const host = (
		rawHost.startsWith("[")
			? rawHost.slice(0, rawHost.indexOf("]") + 1)
			: (rawHost.split(":")[0] ?? "")
	).toLowerCase();
	if (!ALLOWED_HOSTS.has(host)) {
		return c.text(`Host '${host}' not allowed (loopback-only)`, 403);
	}
	await next();
};

export const localhostGuard: MiddlewareHandler = async (c, next) => {
	const rawHost = c.req.header("host") ?? "";
	const host = (
		rawHost.startsWith("[")
			? rawHost.slice(0, rawHost.indexOf("]") + 1)
			: (rawHost.split(":")[0] ?? "")
	).toLowerCase();
	const match = matchHost(host);
	if (!match) {
		return c.text(`Host '${host}' not allowed`, 403);
	}
	// Skip sec-fetch-site for explicitly-allowed external hosts (e.g. tunnels);
	// those are an intentional opt-in, and browsers report "cross-site" for them.
	if (match === "loopback") {
		const fetchSite = c.req.header("sec-fetch-site");
		if (
			fetchSite &&
			fetchSite !== "same-origin" &&
			fetchSite !== "same-site" &&
			fetchSite !== "none"
		) {
			return c.text(`sec-fetch-site '${fetchSite}' rejected`, 403);
		}
	}
	await next();
};

export const setSecurityHeaders = (c: Context) => {
	c.header("X-Content-Type-Options", "nosniff");
	c.header("Referrer-Policy", "no-referrer");
	c.header("X-Frame-Options", "SAMEORIGIN");
};
