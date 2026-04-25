/**
 * Hono bindings for the local Bun runtime.
 *
 * piguy-web is a long-lived local process — no Cloudflare D1, KV, R2, or
 * env bindings. Routes inject their own Effect Layers via defineRoute's
 * `deps:` callback rather than reading them off c.env.
 */
export interface AppBindings {
	ENVIRONMENT?: string;
}
