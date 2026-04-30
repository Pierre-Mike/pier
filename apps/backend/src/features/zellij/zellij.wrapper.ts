/**
 * Zellij iframe wrapper — postMessage relay for the double-shift palette gesture.
 *
 * The Zellij terminal runs inside a cross-origin iframe; the parent window never
 * sees keydown events that fire inside the iframe. This module injects a ~15-line
 * relay script into the HTML page served by the Zellij proxy so that Shift
 * keydowns inside the iframe are forwarded to window.parent as
 * { type: "palette-shift-tap", t: <timestamp> }. The parent palette state machine
 * treats relayed messages identically to native Shift taps.
 *
 * Usage: call `injectPaletteRelay(htmlBody)` on the HTML string returned by the
 * Zellij upstream before serving it to the browser.
 */

const RELAY_SCRIPT = `<script>
(function () {
  "use strict";
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Shift") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    try {
      window.parent.postMessage({ type: "palette-shift-tap", t: Date.now() }, "*");
    } catch (_) {}
  }, true);
})();
</script>`;

/**
 * Inject the palette relay script just before </body> in the given HTML string.
 * If </body> is not found the script is appended at the end.
 */
export function injectPaletteRelay(html: string): string {
	const closeBodyIdx = html.lastIndexOf("</body>");
	if (closeBodyIdx === -1) {
		return html + RELAY_SCRIPT;
	}
	return html.slice(0, closeBodyIdx) + RELAY_SCRIPT + html.slice(closeBodyIdx);
}
