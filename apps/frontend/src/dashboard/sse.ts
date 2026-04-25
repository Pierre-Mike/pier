/**
 * SSE connection wrapper with reconnection support
 */
import { apiBase } from "../api";

export function subscribeEvents(onEvent: (evt: unknown) => void): void {
	const es = new EventSource(`${apiBase}/api/stream/events`);

	es.onmessage = (e) => {
		try {
			const data = JSON.parse(e.data);
			onEvent(data);
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: Error logging
			console.warn("Failed to parse SSE event:", err);
		}
	};

	es.onerror = (err) => {
		// biome-ignore lint/suspicious/noConsole: Error logging
		console.error("EventSource error:", err);
		// EventSource auto-reconnects on error
	};
}
