import type { Context, MiddlewareHandler } from "hono";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const localhostGuard: MiddlewareHandler = async (c, next) => {
	const rawHost = c.req.header("host") ?? "";
	const host = rawHost.startsWith("[")
		? rawHost.slice(0, rawHost.indexOf("]") + 1)
		: rawHost.split(":")[0];
	if (!ALLOWED_HOSTS.has(host ?? "")) {
		return c.text(`Host '${host}' not allowed`, 403);
	}
	const fetchSite = c.req.header("sec-fetch-site");
	// "same-site" allows the Astro dev server (different port, same host) to call
	// the API; the loopback Host check above already restricts who can reach us.
	if (
		fetchSite &&
		fetchSite !== "same-origin" &&
		fetchSite !== "same-site" &&
		fetchSite !== "none"
	) {
		return c.text(`sec-fetch-site '${fetchSite}' rejected`, 403);
	}
	await next();
};

export const setSecurityHeaders = (c: Context) => {
	c.header("X-Content-Type-Options", "nosniff");
	c.header("Referrer-Policy", "no-referrer");
	c.header("X-Frame-Options", "SAMEORIGIN");
};
