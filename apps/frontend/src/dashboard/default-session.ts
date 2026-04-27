/**
 * Default session management
 */
import { api } from "../api";
import { renderSessions } from "./projects";
import { store } from "./state";
import { renderTerminal } from "./ui";
import { $ } from "./utils";

export async function selectDefaultSession(): Promise<void> {
	if (!store.sessions.has("__default__")) {
		try {
			const resp = await api.api.sessions.default.$post();
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const session = await resp.json();
			store.sessions.set("__default__", session);
			renderSessions();
			renderTerminal();
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

	// Restore active state from localStorage on boot
	const stored = localStorage.getItem("pier:active-project");
	if (stored === "__default__") {
		store.activeProject = "__default__";
		// Note: We do NOT call selectDefaultSession() here. The iframe is lazy-spawned
		// only when the user explicitly clicks the button after reload.
	}

	// Update active class when store changes
	const updateActiveClass = () => {
		if (store.activeProject === "__default__") {
			btn.classList.add("active");
		} else {
			btn.classList.remove("active");
		}
	};
	store.subscribe("activeProject", updateActiveClass);
	updateActiveClass();
}
