/**
 * Projects list rendering and management
 */
import { api, apiBase } from "../api";
import { getAgentRowCount } from "./agent-view";
import { refreshFiles } from "./files";
import { refreshRefs } from "./refs";
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
	try {
		const sessRes = await api.api.sessions.$get();
		if (sessRes.ok) {
			const sessData = (await sessRes.json()) as {
				sessions: Array<{ projectId: string; status: string }>;
			};
			const alive = new Set(
				sessData.sessions.filter((s) => s.status === "live").map((s) => s.projectId),
			);
			store.aliveSessions = alive;
		}
	} catch {
		// Non-fatal: aliveSessions stays as-is on error
	}
}

export function filteredProjects(): Project[] {
	const f = store.projectFilter;
	const base = store.projects.filter((p) => !store.sessions.has(p.id));
	return f ? base.filter((p) => p.name.toLowerCase().includes(f)) : base;
}

function dismissContextMenu(): void {
	const existing = document.getElementById("project-ctx-menu");
	if (existing) existing.remove();
	document.removeEventListener("mousedown", onCtxMenuOutside, true);
	document.removeEventListener("keydown", onCtxMenuKey, true);
	window.removeEventListener("blur", dismissContextMenu);
}

function onCtxMenuOutside(e: MouseEvent): void {
	const menu = document.getElementById("project-ctx-menu");
	if (menu && !menu.contains(e.target as Node)) dismissContextMenu();
}

function onCtxMenuKey(e: KeyboardEvent): void {
	if (e.key === "Escape") dismissContextMenu();
}

type CtxMenuItem = { label: string; onClick: () => void };
type CtxMenuArgs = { x: number; y: number; items: CtxMenuItem[] };

function showContextMenu(args: CtxMenuArgs) {
	dismissContextMenu();
	const menu = document.createElement("div");
	menu.id = "project-ctx-menu";
	menu.className = "ctx-menu";
	menu.style.left = `${args.x}px`;
	menu.style.top = `${args.y}px`;
	for (const item of args.items) {
		const row = document.createElement("div");
		row.className = "ctx-menu-item";
		row.textContent = item.label;
		row.addEventListener("click", () => {
			item.onClick();
			dismissContextMenu();
		});
		menu.appendChild(row);
	}
	document.body.appendChild(menu);
	const rect = menu.getBoundingClientRect();
	if (rect.right > window.innerWidth) {
		menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
	}
	if (rect.bottom > window.innerHeight) {
		menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
	}
	document.addEventListener("mousedown", onCtxMenuOutside, true);
	document.addEventListener("keydown", onCtxMenuKey, true);
	window.addEventListener("blur", dismissContextMenu);
}

async function openProjectContextMenu(args: { id: string; x: number; y: number }): Promise<void> {
	let url: string | null = null;
	try {
		const res = await api.api.projects[":id"]["github-url"].$get({ param: { id: args.id } });
		if (res.ok) {
			const data = (await res.json()) as { url: string | null };
			url = data.url;
		}
	} catch {
		url = null;
	}
	if (!url) {
		toast("No GitHub remote for this project");
		return;
	}
	const target = url;
	showContextMenu({
		x: args.x,
		y: args.y,
		items: [
			{
				label: "Open on GitHub",
				onClick: () => {
					window.open(target, "_blank", "noopener,noreferrer");
				},
			},
		],
	});
}

async function openSessionContextMenu(args: { id: string; x: number; y: number }): Promise<void> {
	let url: string | null = null;
	try {
		const res = await api.api.projects[":id"]["github-url"].$get({ param: { id: args.id } });
		if (res.ok) {
			const data = (await res.json()) as { url: string | null };
			url = data.url;
		}
	} catch {
		url = null;
	}
	const target = url;
	showContextMenu({
		x: args.x,
		y: args.y,
		items: [
			{
				label: "Open",
				onClick: () => {
					void selectProject(args.id);
				},
			},
			{
				label: "Open on GitHub",
				onClick: () => {
					if (!target) {
						toast("No GitHub remote for this project");
						return;
					}
					window.open(target, "_blank", "noopener,noreferrer");
				},
			},
			{
				label: "Kill session",
				onClick: () => {
					void closeSession(args.id);
				},
			},
		],
	});
}

function buildProjectLi(p: Project, highlightIdx: number): HTMLLIElement {
	const li = document.createElement("li");
	li.dataset.id = p.id;
	if (store.activeProject === p.id) li.classList.add("active");
	if (store.projectsWithEvents.has(p.id)) li.classList.add("has-events");
	if (highlightIdx === store.projectHighlight) li.classList.add("highlighted");
	li.style.setProperty("--proj-color", projectColor(p.id));
	li.style.userSelect = "none";
	li.title = p.name;
	const aliveSessionDot = store.aliveSessions.has(p.id)
		? `<span class="session-alive-dot" title="Zellij session is alive"></span>`
		: "";
	li.innerHTML = `<span class="dot"></span><span class="initial">${escapeHTML(projectInitial(p.name))}</span><span class="name">${escapeHTML(p.name)}</span>${aliveSessionDot}`;
	li.addEventListener("click", () => selectProject(p.id));
	li.addEventListener("mouseenter", () => {
		if (store.projectHighlight !== highlightIdx) {
			store.projectHighlight = highlightIdx;
		}
	});
	li.addEventListener("contextmenu", (ev) => {
		ev.preventDefault();
		void openProjectContextMenu({ id: p.id, x: ev.clientX, y: ev.clientY });
	});
	return li;
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

	// Group projects by parent directory (repo folder)
	const grouped = new Map<string, typeof list>();
	for (const p of list) {
		const parentDir = p.path.split("/").slice(0, -1).join("/");
		const group = grouped.get(parentDir) ?? [];
		group.push(p);
		grouped.set(parentDir, group);
	}

	// Render group headers + project rows
	let globalIdx = 0;
	for (const [dir, projects] of grouped) {
		const header = document.createElement("li");
		header.className = "proj-group-header";
		header.textContent = dir.split("/").at(-1) ?? dir;
		header.title = dir;
		ul.appendChild(header);
		for (const p of projects) {
			ul.appendChild(buildProjectLi(p, globalIdx++));
		}
	}
	const hl = ul.querySelector("li.highlighted");
	if (hl) hl.scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------------------------
// spec 059: Sidebar tab switcher
// ---------------------------------------------------------------------------

export function wireSidebarTabs(): void {
	const tabs = Array.from(document.querySelectorAll<HTMLElement>(".sidebar-tab"));
	const projectsPanel = document.getElementById("sidebar-tab-projects");
	const agentsPanel = document.getElementById("sidebar-tab-agents");
	if (!projectsPanel || !agentsPanel) return;

	for (const tab of tabs) {
		tab.addEventListener("click", () => {
			const target = tab.dataset.tab;
			for (const t of tabs) {
				t.classList.toggle("active", t === tab);
			}
			// sidebar-tab panels: toggle hidden class based on selection
			projectsPanel.classList.toggle("hidden", target !== "projects");
			agentsPanel.classList.toggle("hidden", target !== "agents");
		});
	}
}

export function renderSidebarTabs(): void {
	const projectsTab = document.querySelector<HTMLElement>('.sidebar-tab[data-tab="projects"]');
	const agentsTab = document.querySelector<HTMLElement>('.sidebar-tab[data-tab="agents"]');
	if (projectsTab) projectsTab.textContent = "Projects";
	if (!agentsTab) return;
	const count = getAgentRowCount();
	agentsTab.textContent = count > 0 ? `Active Agents (${count})` : "Active Agents";
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
	for (const [pid, sess] of Array.from(store.sessions.entries()).filter(
		([id]) => id !== "__default__",
	)) {
		const proj = store.projects.find((p) => p.id === pid);
		const name = proj?.name ?? pid;
		const li = document.createElement("li");
		li.dataset.id = pid;
		if (store.activeProject === pid) li.classList.add("active");
		li.style.setProperty("--proj-color", projectColor(pid));
		li.style.userSelect = "none";
		li.title = name;
		const sessionAliveDot = sess.sessionId
			? `<span class="session-alive-dot" title="Zellij session is alive"></span>`
			: "";
		li.innerHTML = `<span class="dot"></span><span class="initial">${escapeHTML(projectInitial(name))}</span><span class="name">${escapeHTML(name)}</span>${sessionAliveDot}<span class="close" title="Close session" aria-label="Close session">×</span>`;
		li.addEventListener("click", (ev) => {
			const t = ev.target as HTMLElement;
			if (t.classList.contains("close")) {
				ev.stopPropagation();
				void dismissSession(pid);
			} else {
				selectProject(pid);
			}
		});
		li.addEventListener("contextmenu", (ev) => {
			ev.preventDefault();
			void openSessionContextMenu({ id: pid, x: ev.clientX, y: ev.clientY });
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
			if (!resp.ok) {
				// Surface the backend error (set by sessions.repo.ts spawn failures)
				// instead of a bare "HTTP 500" — the body carries the real cause.
				const body = (await resp.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${resp.status}`);
			}
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

	if (id && id !== "__default__") {
		await refreshFiles(id);
		await refreshRefs(id);
	}
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
		store.refs = { branches: [], worktrees: [] };
		const filesTitle = document.getElementById("files-title");
		if (filesTitle) filesTitle.textContent = "Files";
	}
}

/**
 * UI-only session dismiss: removes the session card from the dashboard
 * without terminating the underlying zellij session. The session stays
 * alive on the backend and can be reopened by clicking the project again.
 * Use closeSession (via right-click → Kill session) to terminate the process.
 */
export async function dismissSession(id: string): Promise<void> {
	const sess = store.sessions.get(id);
	if (sess?.iframe) sess.iframe.remove();
	store.sessions.delete(id);
	if (store.activeProject === id) {
		const next = store.sessions.keys().next().value ?? null;
		if (next) {
			await setActiveProject(next);
			return;
		}
		store.activeProject = null;
		if (typeof localStorage !== "undefined") localStorage.removeItem("pier:active-project");
		store.files = [];
		store.activeFilePath = null;
		store.refs = { branches: [], worktrees: [] };
		if (typeof document !== "undefined") {
			const filesTitle = document.getElementById("files-title");
			if (filesTitle) filesTitle.textContent = "Files";
		}
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
			// Backend returns a path like "/zellij/<id>". Prepend apiBase so dev
			// (Astro on :5274 → backend on :5273) resolves cross-port; in
			// single-origin/tunnel mode apiBase is "" and the path stays relative.
			iframe.src = sess.url.startsWith("/") ? `${apiBase}${sess.url}` : sess.url;
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
