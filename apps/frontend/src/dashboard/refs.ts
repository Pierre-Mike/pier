/**
 * Branches + worktrees panel — single combined list rendered into #refs-list
 * inside the artifacts pane.
 */
import { api } from "../api";
import { store } from "./state";
import type { Branch, Worktree } from "./types";
import { escapeHTML, toast } from "./utils";

export async function refreshRefs(projectId: string): Promise<void> {
	store.refs = { branches: [], worktrees: [] };
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client resolves fine at runtime; TS needs help in Astro client scripts
		const res = await (api as any).api.projects[":id"].refs.$get({
			param: { id: projectId },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { branches: Branch[]; worktrees: Worktree[] };
		store.refs = { branches: data.branches ?? [], worktrees: data.worktrees ?? [] };
	} catch {
		store.refs = { branches: [], worktrees: [] };
	}
}

export function renderRefs(): void {
	const host = document.getElementById("refs-list");
	if (!host) return;
	const { branches, worktrees } = store.refs;
	if (branches.length === 0 && worktrees.length === 0) {
		host.hidden = true;
		host.innerHTML = "";
		return;
	}
	host.hidden = false;
	host.innerHTML = "";

	for (const wt of worktrees) {
		host.appendChild(renderWorktreeRow(wt));
	}
	for (const br of branches) {
		host.appendChild(renderBranchRow(br));
	}
}

function renderBranchRow(br: Branch): HTMLDivElement {
	const row = document.createElement("div");
	row.className = "ref-row";
	const suffix = br.current ? `<span class="ref-suffix">· current</span>` : "";
	row.innerHTML = `<span class="ref-glyph">⎇</span><span class="ref-name">${escapeHTML(br.name)}</span>${suffix}`;
	row.addEventListener("click", () => copyRef(br.name));
	return row;
}

function renderWorktreeRow(wt: Worktree): HTMLDivElement {
	const row = document.createElement("div");
	row.className = "ref-row worktree";
	const branch = wt.branch ?? "(detached)";
	const label = wt.relPath && wt.relPath !== "." ? `${branch} · ${wt.relPath}` : branch;
	const suffix = wt.isMain ? `<span class="ref-suffix">· main</span>` : "";
	row.innerHTML = `<span class="ref-glyph">🌿</span><span class="ref-name">${escapeHTML(label)}</span>${suffix}`;
	row.addEventListener("click", () => copyRef(wt.branch ?? wt.path));
	return row;
}

function copyRef(value: string): void {
	const writer = navigator.clipboard?.writeText?.bind(navigator.clipboard);
	if (writer) {
		void writer(value).then(
			() => toast(`Copied: ${value}`),
			() => toast(value),
		);
	} else {
		toast(value);
	}
}
