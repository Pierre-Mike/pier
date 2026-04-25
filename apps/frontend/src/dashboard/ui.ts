/**
 * UI wiring - pane toggles, resize handles
 */
import { $ } from "./utils";

// biome-ignore lint/complexity/useMaxParams: UI wiring requires all params
export function wirePaneToggle(
	btnId: string,
	paneId: string,
	bodyClass: string,
	openGlyph: string,
	closedGlyph: string,
): void {
	const btn = document.getElementById(btnId);
	const pane = document.getElementById(paneId);
	if (!btn || !pane) return;
	const key = `pier:${bodyClass}`;
	const apply = (collapsed: boolean) => {
		document.body.classList.toggle(bodyClass, collapsed);
		pane.classList.toggle("collapsed", collapsed);
		btn.textContent = collapsed ? closedGlyph : openGlyph;
		btn.title = (collapsed ? "Expand " : "Collapse ") + paneId;
	};
	apply(localStorage.getItem(key) === "1");
	btn.addEventListener("click", () => {
		const next = !document.body.classList.contains(bodyClass);
		localStorage.setItem(key, next ? "1" : "0");
		apply(next);
	});
}

export function wireResizeHandle(): void {
	const handle = $("#resize-right");
	const key = "pier:col-right";
	const saved = localStorage.getItem(key);
	if (saved) document.body.style.setProperty("--col-right", saved);
	let dragging = false;
	handle.addEventListener("mousedown", (e) => {
		dragging = true;
		handle.classList.add("dragging");
		document.body.classList.add("resizing");
		e.preventDefault();
	});
	window.addEventListener("mousemove", (e) => {
		if (!dragging) return;
		const px = Math.min(900, Math.max(200, window.innerWidth - e.clientX));
		document.body.style.setProperty("--col-right", `${px}px`);
	});
	window.addEventListener("mouseup", () => {
		if (!dragging) return;
		dragging = false;
		handle.classList.remove("dragging");
		document.body.classList.remove("resizing");
		const w = getComputedStyle(document.body).getPropertyValue("--col-right").trim();
		if (w) localStorage.setItem(key, w);
	});
	handle.addEventListener("dblclick", () => {
		document.body.style.removeProperty("--col-right");
		localStorage.removeItem(key);
	});
}

export function wireTerminalRefit(): void {
	const host = $("#terminals");
	if (!host || typeof ResizeObserver === "undefined") return;
	let lastH = 0;
	let timer = 0;
	const refitActive = () => {
		const iframe = host.querySelector<HTMLIFrameElement>("iframe:not(.hidden)");
		if (!iframe) return;
		iframe.style.width = "calc(100% - 24px)";
		iframe.style.height = "calc(100% - 24px)";
		requestAnimationFrame(() => {
			iframe.style.width = "";
			iframe.style.height = "";
		});
	};
	const schedule = () => {
		clearTimeout(timer);
		timer = window.setTimeout(refitActive, 180);
	};
	new ResizeObserver((entries) => {
		const h = entries[0]?.contentRect.height ?? 0;
		if (Math.abs(h - lastH) < 4) return;
		lastH = h;
		schedule();
	}).observe(host);
	window.addEventListener("orientationchange", schedule);
}
