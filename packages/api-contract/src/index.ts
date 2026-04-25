/**
 * @pier/api-contract
 *
 * Typed Hono RPC client derived from the backend's AppType.
 * Types flow automatically — no manual sync needed.
 */
import type { AppType } from "@pier/backend/types";
import { hc } from "hono/client";

export type { AppType };

export function createBackendClient(baseUrl: string) {
	return hc<AppType>(baseUrl);
}
