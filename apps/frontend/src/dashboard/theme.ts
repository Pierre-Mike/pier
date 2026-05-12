/*
 * Theme toggle + persistence — spec 044.
 *
 * `data-theme` on <html> drives the CSS token cascade in theme.css. We read
 * from / write to localStorage under the key "pier-theme". The inline init
 * script in index.astro <head> applies the saved value before first paint;
 * this module wires the runtime toggle button after the page is interactive.
 */

const STORAGE_KEY = "pier-theme";
type Theme = "dark" | "light";

export function getTheme(): Theme {
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme(): void {
	const current = getTheme();
	applyTheme(current);
	const btn = document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');
	if (!btn) return;
	btn.addEventListener("click", () => {
		const next: Theme = getTheme() === "dark" ? "light" : "dark";
		applyTheme(next);
	});
}
