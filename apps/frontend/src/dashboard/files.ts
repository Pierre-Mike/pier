/**
 * File tree rendering and management
 */
import { api } from "../api";
import { store } from "./state";
import type { AppConfig, FileEntry } from "./types";
import { $, escapeHTML } from "./utils";
import { openRepoFile } from "./viewer";

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

export async function refreshFiles(projectId: string): Promise<void> {
	store.files = [];
	store.activeFilePath = null;
	store.expandedDirs = new Set();
	const filesTitle = document.getElementById("files-title");
	if (filesTitle) filesTitle.textContent = projectId;
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client resolves fine at runtime; TS needs help in Astro client scripts
		const res = await (api as any).api.projects[":id"].files.$get({ param: { id: projectId } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { files: FileEntry[] };
		store.files = data.files;
	} catch {
		store.files = [];
	}
}

interface TreeNode {
	dirs: Map<string, TreeNode>;
	files: Array<{ name: string; path: string }>;
}

function buildTree(files: FileEntry[]): TreeNode {
	const root: TreeNode = { dirs: new Map(), files: [] };
	for (const f of files) {
		const parts = f.path.split("/");
		let node = root;
		for (let i = 0; i < parts.length - 1; i++) {
			const d = parts[i];
			let child = node.dirs.get(d);
			if (!child) {
				child = { dirs: new Map(), files: [] };
				node.dirs.set(d, child);
			}
			node = child;
		}
		node.files.push({ name: parts[parts.length - 1], path: f.path });
	}
	return root;
}

export function renderFileTree(): void {
	const host = $("#file-tree");
	if (!store.activeProject) {
		host.innerHTML = `<div class="placeholder">Select a project to browse files.</div>`;
		return;
	}
	const filter = store.fileFilter;
	const filtered = filter
		? store.files.filter((f) => f.path.toLowerCase().includes(filter))
		: store.files;
	if (filtered.length === 0) {
		host.innerHTML = `<div class="placeholder">${filter ? "no matches" : "no tracked files (not a git repo?)"}</div>`;
		return;
	}
	const tree = buildTree(filtered);
	const ul = document.createElement("ul");
	ul.className = "tree-root";
	renderTreeNode(tree, "", ul, !!filter);
	host.innerHTML = "";
	host.appendChild(ul);
}

// biome-ignore lint/complexity/useMaxParams: Tree traversal needs all params
function renderTreeNode(
	node: TreeNode,
	prefix: string,
	ul: HTMLElement,
	forceExpand: boolean,
): void {
	const dirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
	for (const [name, child] of dirs) {
		const path = prefix ? `${prefix}/${name}` : name;
		const expanded = forceExpand || store.expandedDirs.has(path);
		const li = document.createElement("li");
		li.className = "tree-dir";
		const row = document.createElement("div");
		row.className = "tree-row";
		row.innerHTML = `<span class="chev">${expanded ? "▾" : "▸"}</span><span class="name">${escapeHTML(name)}</span>`;
		row.addEventListener("click", () => {
			if (store.expandedDirs.has(path)) store.expandedDirs.delete(path);
			else store.expandedDirs.add(path);
		});
		li.appendChild(row);
		if (expanded) {
			const sub = document.createElement("ul");
			renderTreeNode(child, path, sub, forceExpand);
			li.appendChild(sub);
		}
		ul.appendChild(li);
	}
	const files = node.files.sort((a, b) => a.name.localeCompare(b.name));
	for (const f of files) {
		const li = document.createElement("li");
		li.className = `tree-file${store.activeFilePath === f.path ? " active" : ""}`;
		li.innerHTML = `<div class="tree-row"><span class="chev"></span><span class="name">${escapeHTML(f.name)}</span></div>`;
		li.draggable = true;
		li.addEventListener("click", () => openRepoFile(f.path, f.name));
		li.addEventListener("dragstart", (e) => {
			// biome-ignore lint/style/noNonNullAssertion: activeProject guaranteed by renderFileTree guard
			const abs = absoluteRepoPath(store.activeProject!, f.path);
			const shell = shellQuote(abs);
			if (e.dataTransfer) {
				e.dataTransfer.setData("text/plain", shell);
				e.dataTransfer.setData("text/x-pier-path", abs);
				e.dataTransfer.effectAllowed = "copy";
			}
		});
		ul.appendChild(li);
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
	$("#file-filter").addEventListener("input", (e) => {
		const target = e.target as HTMLInputElement;
		store.fileFilter = target.value.toLowerCase();
	});
}
