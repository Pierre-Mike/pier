import { api } from "../api";
import { store } from "./state";
import type { Branch, Worktree } from "./types";
import { escapeHTML, toast } from "./utils";

interface RefEntry {
	name: string;
	branch?: Branch;
	worktree?: Worktree;
}

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

export function buildRefEntries(branches: Branch[], worktrees: Worktree[]): RefEntry[] {
	const byName = new Map<string, RefEntry>();
	for (const br of branches) {
		byName.set(br.name, { name: br.name, branch: br });
	}
	const detached: RefEntry[] = [];
	for (const wt of worktrees) {
		if (!wt.branch) {
			detached.push({ name: `(detached) · ${wt.relPath || wt.path}`, worktree: wt });
			continue;
		}
		const existing = byName.get(wt.branch);
		if (existing) existing.worktree = wt;
		else byName.set(wt.branch, { name: wt.branch, worktree: wt });
	}
	const entries = [...byName.values()];
	entries.sort(compareEntries);
	return [...entries, ...detached];
}

function entryRank(e: RefEntry): number {
	if (e.worktree?.isMain) return 0;
	if (e.worktree) return 1;
	if (e.branch?.current) return 2;
	return 3;
}

function compareEntries(a: RefEntry, b: RefEntry): number {
	const r = entryRank(a) - entryRank(b);
	return r !== 0 ? r : a.name.localeCompare(b.name);
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
	for (const entry of buildRefEntries(branches, worktrees)) {
		host.appendChild(renderRefRow(entry));
	}
}

function renderRefRow(entry: RefEntry): HTMLDivElement {
	const row = document.createElement("div");
	const hasWorktree = !!entry.worktree;
	row.className = hasWorktree ? "ref-row worktree" : "ref-row";
	const glyph = hasWorktree ? "🌿" : "⎇";
	const path = entry.worktree?.relPath;
	const pathSuffix =
		path && path !== "." ? `<span class="ref-path">· ${escapeHTML(path)}</span>` : "";
	const suffixes: string[] = [];
	if (entry.worktree?.isMain) suffixes.push("main");
	if (entry.branch?.current) suffixes.push("current");
	const suffix = suffixes.length
		? `<span class="ref-suffix">· ${escapeHTML(suffixes.join(", "))}</span>`
		: "";
	row.innerHTML = `<span class="ref-glyph">${glyph}</span><span class="ref-name">${escapeHTML(entry.name)}</span>${pathSuffix}${suffix}`;
	row.addEventListener("click", () =>
		copyRef(entry.branch?.name ?? entry.worktree?.path ?? entry.name),
	);
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
