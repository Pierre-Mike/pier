/**
 * Projects list rendering and management
 */
import { api } from "../api";
import { refreshFiles } from "./files";
import { store } from "./state";
import { focusTerminalIframe } from "./terminal-focus";
import type { Project } from "./types";
import { $, escapeHTML, projectColor, projectInitial, toast } from "./utils";

export async function refreshProjects(): Promise<void> {
	try {
		const res = await api.api.projects.$get();
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		store.projects = data.projects as Project[];
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: Error logging
		console.error("Failed to fetch projects:", e);
		toast("Failed to load projects");
	}
}

export function filteredProjects(): Project[] {
	const f = store.projectFilter;
	const base = store.projects.filter((p) => !store.sessions.has(p.id));
	return f ? base.filter((p) => p.name.toLowerCase().includes(f)) : base;
}

export function renderProjects(): void {
	const ul = $("#projects");
	ul.innerHTML = "";
	const list = filteredProjects();
	if (list.length === 0) {
		const li = document.createElement("li");
		li.className = "empty";
		li.textContent = store.projectFilter ? "no matches" : "no projects";
		ul.appendChild(li);
		return;
	}
	for (let i = 0; i < list.length; i++) {
		const p = list[i];
		const li = document.createElement("li");
		li.dataset.id = p.id;
		if (store.activeProject === p.id) li.classList.add("active");
		if (store.sessions.has(p.id)) li.classList.add("open");
		if (store.projectsWithEvents.has(p.id)) li.classList.add("has-events");
		if (i === store.projectHighlight) li.classList.add("highlighted");
		li.style.setProperty("--proj-color", projectColor(p.id));
		li.title = p.name;
		li.innerHTML = `<span class="dot"></span><span class="initial">${escapeHTML(projectInitial(p.name))}</span><span class="name">${escapeHTML(p.name)}</span>`;
		li.addEventListener("click", () => selectProject(p.id));
		li.addEventListener("mouseenter", () => {
			if (store.projectHighlight !== i) {
				store.projectHighlight = i;
			}
		});
		ul.appendChild(li);
	}
	const hl = ul.querySelector("li.highlighted");
	if (hl) hl.scrollIntoView({ block: "nearest" });
}

export function renderSessions(): void {
	const section = $("#sessions-section");
	const ul = $("#sessions");
	ul.innerHTML = "";
	if (store.sessions.size === 0) {
		section.classList.add("hidden");
		return;
	}
	section.classList.remove("hidden");
	for (const [pid] of Array.from(store.sessions.entries()).filter(([id]) => id !== "__default__")) {
		const proj = store.projects.find((p) => p.id === pid);
		const name = proj?.name ?? pid;
		const li = document.createElement("li");
		li.dataset.id = pid;
		if (store.activeProject === pid) li.classList.add("active");
		li.style.setProperty("--proj-color", projectColor(pid));
		li.title = name;
		li.innerHTML = `<span class="dot"></span><span class="initial">${escapeHTML(projectInitial(name))}</span><span class="name">${escapeHTML(name)}</span><span class="close" title="Close session" aria-label="Close session">×</span>`;
		li.addEventListener("click", (ev) => {
			const t = ev.target as HTMLElement;
			if (t.classList.contains("close")) {
				ev.stopPropagation();
				void closeSession(pid);
			} else {
				selectProject(pid);
			}
		});
		ul.appendChild(li);
	}
}

export async function selectProject(id: string): Promise<void> {
	store.projectsWithEvents.delete(id);
	if (!store.sessions.has(id)) {
		try {
			const resp = await api.api.projects[":id"].terminal.$post({
				param: { id },
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const info = (await resp.json()) as { url: string; id: string };
			store.sessions.set(id, { url: info.url, sessionId: info.id });
		} catch (e) {
			const msg = e instanceof Error ? e.message : "unknown error";
			toast(`Failed to open terminal: ${msg}`);
			return;
		}
	}
	await setActiveProject(id);
}

export async function setActiveProject(id: string | null): Promise<void> {
	store.activeProject = id;
	if (id) {
		localStorage.setItem("pier:active-project", id);
	} else {
		localStorage.removeItem("pier:active-project");
	}
	store.fileFilter = "";
	const ff = document.getElementById("file-filter") as HTMLInputElement | null;
	if (ff) ff.value = "";
	store.logsProject = id ?? "";
	store.logsSession = "";
	const sel = document.getElementById("logs-project") as HTMLSelectElement | null;
	if (sel) sel.value = store.logsProject;

	// Reload logs history if modal is open
	if (store.logsOpen) {
		const { loadLogsHistory } = await import("./logs");
		await loadLogsHistory();
	}

	if (id && id !== "__default__") await refreshFiles(id);
}

export async function closeSession(id: string): Promise<void> {
	const sess = store.sessions.get(id);
	try {
		await api.api.sessions[":id"].$delete({ param: { id } });
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: Error logging
		console.warn(`Failed to close session ${id}:`, e);
	}
	if (sess?.iframe) sess.iframe.remove();
	store.sessions.delete(id);
	if (store.activeProject === id) {
		const next = store.sessions.keys().next().value ?? null;
		if (next) {
			await setActiveProject(next);
			return;
		}
		store.activeProject = null;
		localStorage.removeItem("pier:active-project");
		store.files = [];
		store.activeFilePath = null;
		const filesTitle = document.getElementById("files-title");
		if (filesTitle) filesTitle.textContent = "Files";
	}
}

export function renderTerminal(): void {
	const host = $("#terminals");
	if (store.sessions.size === 0) {
		host.innerHTML = `<div class="placeholder">Select a project to open a terminal.</div>`;
		return;
	}
	const placeholder = host.querySelector(".placeholder");
	if (placeholder) placeholder.remove();
	for (const [pid, sess] of store.sessions) {
		if (!sess.iframe) {
			const iframe = document.createElement("iframe");
			iframe.src = sess.url;
			iframe.dataset.project = pid;
			iframe.tabIndex = 0;
			iframe.setAttribute("allow", "clipboard-read; clipboard-write");
			iframe.style.width = "calc(100% - 24px)";
			iframe.style.height = "calc(100% - 24px)";
			iframe.addEventListener("pointerdown", focusTerminalIframe);
			iframe.addEventListener(
				"load",
				() => {
					requestAnimationFrame(() => {
						iframe.style.width = "";
						iframe.style.height = "";
					});
				},
				{ once: true },
			);
			host.appendChild(iframe);
			sess.iframe = iframe;
		}
		sess.iframe.classList.toggle("hidden", pid !== store.activeProject);
	}
}

function wireIframeFocusGlow(): void {
	const host = $("#terminals");
	document.addEventListener("mousedown", (e) => {
		const target = e.target as Node | null;
		host.classList.toggle("iframe-focused", !!target && host.contains(target));
	});
	window.addEventListener("blur", () => {
		setTimeout(() => {
			const a = document.activeElement;
			if (a?.tagName === "IFRAME" && host.contains(a)) {
				host.classList.add("iframe-focused");
			}
		}, 0);
	});
}

export function wireProjectsUI(): void {
	wireIframeFocusGlow();
	$("#refresh-projects").addEventListener("click", () => void refreshProjects());
	const projFilter = $("#project-filter") as HTMLInputElement;
	projFilter.addEventListener("input", (e) => {
		const target = e.target as HTMLInputElement;
		store.projectFilter = target.value.toLowerCase();
		store.projectHighlight = 0;
	});
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard nav logic
	projFilter.addEventListener("keydown", (e) => {
		const list = filteredProjects();
		if (e.key === "Enter") {
			const sel = list[store.projectHighlight];
			if (sel) void selectProject(sel.id);
		} else if (e.key === "Escape") {
			projFilter.value = "";
			store.projectFilter = "";
			store.projectHighlight = 0;
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			if (list.length) {
				store.projectHighlight = (store.projectHighlight + 1) % list.length;
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (list.length) {
				store.projectHighlight = (store.projectHighlight - 1 + list.length) % list.length;
			}
		}
	});
}
