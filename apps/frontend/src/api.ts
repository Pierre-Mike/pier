import type { AppType } from "@pier/backend/types";
import { hc } from "hono/client";

/**
 * Typed Hono RPC client for the pier backend.
 *
 * Importing `AppType` proves the backend builds and exports the route tree.
 * `hc<AppType>(...)` should return a typed proxy that mirrors that tree,
 * but the AppType here composes ~13 sub-apps (each itself a Hono with
 * multiple methods) and TS gives up resolving the deeply-nested shape —
 * the call result is inferred as `unknown`. We swallow the `any` at this
 * one boundary so the dashboard modules keep working; the alternative
 * (per-call-site casts) was tried and was worse.
 *
 * Tests against the backend (130 in apps/backend) verify the actual route
 * surface; this typing escape hatch only affects the frontend proxy.
 */
// AppType import is load-bearing: confirms backend types compile cleanly.
type _BackendBuildsCleanly = AppType;

export const apiBase = import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:5273";

// biome-ignore lint/suspicious/noExplicitAny: deep AppType inference falls back to unknown — see comment above
export const api: any = hc<AppType>(apiBase);
