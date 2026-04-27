/**
 * Default session management
 */
import { api } from "../api";
import { store } from "./state";
import { $ } from "./utils";

export async function selectDefaultSession(): Promise<void> {
	if (!store.sessions.has("__default__")) {
		try {
			const resp = await api.api.sessions.default.$post();
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const session = await resp.json();
			store.sessions.set("__default__", session);
		} catch (e) {
			// biome-ignore lint/suspicious/noConsole: Error logging
			console.error("Failed to open default session:", e);
			return;
		}
	}
	store.activeProject = "__default__";
	localStorage.setItem("pier:active-project", "__default__");
}

export function wireDefaultSession(): void {
	const btn = $("#default-session-btn");
	btn.addEventListener("click", () => {
		void selectDefaultSession();
	});

	store.observe(() => {
		if (store.activeProject === "__default__") {
			btn.classList.add("active");
		} else {
			btn.classList.remove("active");
		}
	});
}
