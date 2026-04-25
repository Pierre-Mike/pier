import { createBackendClient } from "@piguy/api-contract";

export { createBackendClient };

const apiBase = import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:5273";
export const api = createBackendClient(apiBase) as ReturnType<typeof createBackendClient> & {
	api: Record<string, unknown>;
};
