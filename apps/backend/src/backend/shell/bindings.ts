/**
 * Hono bindings for the local Bun runtime.
 *
 * piguy-web is a long-lived local process — no Cloudflare D1, KV, R2, or
 * env bindings. The shape is kept as a typed object so future request-scoped
 * dependencies (e.g., a per-request request-id) can be added without
 * touching every route signature.
 */
export interface AppBindings {
	ENVIRONMENT?: string;
}
