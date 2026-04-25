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
	if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
		return c.text(`sec-fetch-site '${fetchSite}' rejected`, 403);
	}
	await next();
};

export const setSecurityHeaders = (c: Context) => {
	c.header("X-Content-Type-Options", "nosniff");
	c.header("Referrer-Policy", "no-referrer");
	c.header("X-Frame-Options", "SAMEORIGIN");
};
