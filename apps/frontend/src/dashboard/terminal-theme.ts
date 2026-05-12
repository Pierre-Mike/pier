/*
 * Terminal iframe theme relay — spec 045.
 *
 * Sends a postMessage to all active zellij-web terminal iframes when the
 * UI theme changes. The zellij proxy (apps/backend/src/features/zellij/)
 * injects a receiver script into the served HTML that applies the theme to
 * the iframe chrome (background, scrollbars, surrounding UI elements).
 *
 * Limitation: xterm.js terminal canvas colors (the rendered text) cannot be
 * changed at runtime via postMessage without calling xterm's setOption('theme')
 * API on the internal xterm instance — that would require zellij-web to expose
 * a public message API or a DOM hook, which it does not. Only the surrounding
 * chrome is affected by this relay.
 *
 * See design.md § Investigation for the full analysis.
 */

export type TerminalTheme = "dark" | "light";

/**
 * Relay the given theme to all active terminal iframes in the #terminals host.
 * Uses postMessage so it works cross-origin (zellij runs on the backend origin).
 * The injected receiver script in the proxied HTML applies the theme to the
 * iframe document's root element.
 */
export function syncTerminalTheme(theme: TerminalTheme): void {
	const host = document.querySelector<HTMLElement>("#terminals");
	if (!host) return;
	const iframes = host.querySelectorAll<HTMLIFrameElement>("[data-project]");
	for (const iframe of iframes) {
		try {
			iframe.contentWindow?.postMessage({ type: "pier-theme-change", theme }, "*");
		} catch {
			// Cross-origin postMessage can throw in some hardened environments;
			// swallow silently — theme sync is best-effort.
		}
	}
}
