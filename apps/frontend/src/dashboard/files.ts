/**
 * File tree rendering and management
 */
import { api } from "../api";
import { store } from "./state";
import type { AppConfig } from "./types";
import { $, escapeHTML } from "./utils";
import { openRepoFile, vscodeFolderUrl } from "./viewer";

/** A single immediate child entry (file or directory) from the lazy-load API. */
interface ChildEntry {
	readonly path: string;
	readonly isDir: boolean;
	readonly ignored: boolean;
}

/**
 * Per-folder cache for lazy-loaded children.
 * Key: folder path relative to repo root (empty string = root level).
 * Value: immediate children of that folder.
 * Cleared on project change via refreshFiles.
 */
export const folderChildrenCache: Map<string, ChildEntry[]> = new Map();

export let appConfig: AppConfig | null = null;

export async function loadConfig(): Promise<void> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client resolves fine at runtime; TS needs help in Astro client scripts
		const res = await (api as any).api.config.$get();
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		appConfig = (await res.json()) as AppConfig;
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: Error logging
		console.error("Failed to load config:", e);
	}
}

/**
 * Fetch immediate children of a folder from the backend (lazy-load path).
 * Results are stored in `folderChildrenCache` keyed by `folderPath`.
 * `folderPath` is a repo-relative path without leading/trailing slashes;
 * empty string means the repo root.
 */
export async function fetchFolderChildren(
	projectId: string,
	folderPath: string,
): Promise<ChildEntry[]> {
	const cached = folderChildrenCache.get(folderPath);
	if (cached !== undefined) return cached;
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client resolves fine at runtime; TS needs help in Astro client scripts
		const res = await (api as any).api.projects[":id"].files.$get({
			param: { id: projectId },
			query: { prefix: folderPath },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { files: ChildEntry[] };
		folderChildrenCache.set(folderPath, data.files);
		return data.files;
	} catch {
		folderChildrenCache.set(folderPath, []);
		return [];
	}
}

export async function refreshFiles(projectId: string): Promise<void> {
	store.activeFilePath = null;
	store.expandedDirs = new Set();
	folderChildrenCache.clear();
	const filesTitle = document.getElementById("files-title");
	if (filesTitle) filesTitle.textContent = projectId;
	const vscodeLink = document.getElementById("open-vscode-folder") as HTMLAnchorElement | null;
	if (vscodeLink) {
		vscodeLink.href = vscodeFolderUrl(appConfig?.projectsRoot, projectId);
		vscodeLink.hidden = false;
	}
	// Lazy path: pre-fetch root-level children so the tree renders immediately.
	await fetchFolderChildren(projectId, "");
	renderFileTree();
}

export function renderFileTree(): void {
	const host = $("#file-tree");
	if (!store.activeProject) {
		host.innerHTML = `<div class="placeholder">Select a project to browse files.</div>`;
		return;
	}

	// Lazy path: render from folderChildrenCache.
	const rootChildren = folderChildrenCache.get("");
	if (rootChildren && rootChildren.length > 0) {
		const ul = document.createElement("ul");
		ul.className = "tree-root";
		renderCachedChildren(store.activeProject, rootChildren, ul);
		host.innerHTML = "";
		host.appendChild(ul);
		return;
	}
	host.innerHTML = `<div class="placeholder">no tracked files (not a git repo?)</div>`;
}

/**
 * Render children from folderChildrenCache into `ul`.
 * Directories that are expanded (via store.expandedDirs) will recursively
 * render their cached children. If a directory is expanded but not yet in
 * cache, a placeholder is shown until fetchFolderChildren resolves and
 * renderFileTree is re-called.
 */
// biome-ignore lint/complexity/useMaxParams: 3 params required for lazy dir rendering context
function renderCachedDirEntry(projectId: string, entry: ChildEntry, ul: HTMLElement): void {
	const name = entry.path.split("/").pop() ?? entry.path;
	const expanded = store.expandedDirs.has(entry.path);
	const li = document.createElement("li");
	li.className = "tree-dir";
	const row = document.createElement("div");
	row.className = "tree-row";
	row.innerHTML = `<span class="chev">${expanded ? "▾" : "▸"}</span><span class="name">${escapeHTML(name)}</span>`;
	row.addEventListener("click", () => {
		if (store.expandedDirs.has(entry.path)) {
			store.expandedDirs.delete(entry.path);
		} else {
			store.expandedDirs.add(entry.path);
			void fetchFolderChildren(projectId, entry.path).then(() => renderFileTree());
		}
		renderFileTree();
	});
	li.appendChild(row);
	if (expanded) {
		const subChildren = folderChildrenCache.get(entry.path);
		if (subChildren) {
			const sub = document.createElement("ul");
			renderCachedChildren(projectId, subChildren, sub);
			li.appendChild(sub);
		}
	}
	ul.appendChild(li);
}

function renderCachedFileEntry(entry: ChildEntry, ul: HTMLElement): void {
	const name = entry.path.split("/").pop() ?? entry.path;
	const li = document.createElement("li");
	li.className = `tree-file${store.activeFilePath === entry.path ? " active" : ""}${entry.ignored ? " tree-file--ignored" : ""}`;
	li.innerHTML = `<div class="tree-row"><span class="chev"></span><span class="name">${escapeHTML(name)}</span></div>`;
	li.draggable = true;
	li.addEventListener("click", () => openRepoFile(entry.path, name));
	li.addEventListener("dragstart", (e) => {
		// biome-ignore lint/style/noNonNullAssertion: activeProject guaranteed by renderFileTree guard
		const abs = absoluteRepoPath(store.activeProject!, entry.path);
		const shell = shellQuote(abs);
		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", shell);
			e.dataTransfer.setData("text/x-pier-path", abs);
			e.dataTransfer.effectAllowed = "copy";
		}
	});
	ul.appendChild(li);
}

// biome-ignore lint/complexity/useMaxParams: 3 params needed for recursive cached tree rendering
function renderCachedChildren(
	projectId: string,
	children: readonly ChildEntry[],
	ul: HTMLElement,
): void {
	const sorted = [...children].sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		return a.path.localeCompare(b.path);
	});
	for (const entry of sorted) {
		if (entry.isDir) {
			renderCachedDirEntry(projectId, entry, ul);
		} else {
			renderCachedFileEntry(entry, ul);
		}
	}
}

function absoluteRepoPath(projectId: string, relPath: string): string {
	const root = appConfig?.projectsRoot?.replace(/\/+$/, "") ?? "";
	return `${root}/${projectId}/${relPath}`;
}

function shellQuote(s: string): string {
	if (/^[A-Za-z0-9_\-./~]+$/.test(s)) return s;
	return `'${s.replace(/'/g, "'\\''")}'`;
}

export function wireFileTreeUI(): void {
	$("#files-refresh").addEventListener("click", () => {
		const id = store.activeProject;
		if (!id) return;
		void refreshFiles(id);
	});
}
