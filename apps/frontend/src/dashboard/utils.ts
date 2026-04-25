/**
 * Utility functions
 */

export function $(sel: string): HTMLElement {
	const el = document.querySelector<HTMLElement>(sel);
	if (!el) throw new Error(`Element not found: ${sel}`);
	return el;
}

export function escapeHTML(s: string | undefined | null): string {
	return String(s ?? "").replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
	);
}

export function escapeAttr(s: string): string {
	return escapeHTML(s);
}

export function safeParse<T>(s: string): T | null {
	try {
		return JSON.parse(s) as T;
	} catch {
		return null;
	}
}

export function projectColor(id: string): string {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = ((h << 5) - h + id.charCodeAt(i)) | 0;
	}
	return `hsl(${((h % 360) + 360) % 360}, 62%, 62%)`;
}

export function projectInitial(name: string): string {
	return (name.trim()[0] || "?").toUpperCase();
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string): void {
	let el = document.getElementById("toast");
	if (!el) {
		el = document.createElement("div");
		el.id = "toast";
		document.body.appendChild(el);
	}
	el.textContent = msg;
	el.classList.add("show");
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el?.classList.remove("show"), 2600);
}

export function fmtTime(d: Date): string {
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

export function fmtDur(ms: number): string {
	const n = Number(ms);
	if (!Number.isFinite(n)) return String(ms);
	if (n < 1000) return `${n.toFixed(0)}ms`;
	if (n < 60000) return `${(n / 1000).toFixed(2)}s`;
	return `${(n / 60000).toFixed(1)}m`;
}
