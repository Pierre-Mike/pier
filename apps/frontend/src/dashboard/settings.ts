/**
 * Settings popup — FAB + modal with Share and About tabs.
 *
 * Injects its own HTML into document.body so it stays within the
 * apps/frontend/src/dashboard boundary without touching pages/index.astro.
 *
 * Share tab: read-only zellij watcher URL (fetched from GET /settings/zellij-readonly).
 *   Copy button writes the URL to clipboard.
 *   Regenerate button re-fetches the URL (token rotation is a non-goal; this just
 *   re-calls GET to refresh the in-memory value if the server restarted).
 *
 * About tab: pier version + local zellij backend URL (not shareable).
 */
import { api, apiBase } from "../api";
import { toast } from "./utils";

// ---------------------------------------------------------------------------
// HTML injection
// ---------------------------------------------------------------------------

const MODAL_HTML = `
<button id="settings-fab" class="settings-fab" title="Settings" aria-label="Open settings">⚙</button>

<div id="settings-modal" class="viewer-modal hidden" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="viewer-backdrop" data-close-settings></div>
  <div class="viewer-dialog settings-dialog">
    <button class="viewer-close" data-close-settings aria-label="Close">×</button>
    <header class="settings-head">
      <h2>Settings</h2>
      <div class="settings-tabs" role="tablist">
        <button class="settings-tab active" data-tab="share" role="tab">Share</button>
        <button class="settings-tab" data-tab="tunnel" role="tab">Tunnel</button>
        <button class="settings-tab" data-tab="about" role="tab">About</button>
      </div>
    </header>

    <div id="settings-panel-share" class="settings-panel">
      <p class="settings-label">Read-only zellij watcher URL</p>
      <div class="settings-url-row">
        <input id="settings-url" class="settings-url-input" type="text" readonly value="Loading…" />
        <button id="settings-copy" class="settings-btn">Copy</button>
        <button id="settings-regen" class="settings-btn">Regenerate</button>
      </div>
      <p class="settings-hint">Share this watch-only URL to give read-only zellij viewing. Viewers cannot type into or control your session. The token is passed as a URL fragment and never logged by the server.</p>
    </div>

    <div id="settings-panel-tunnel" class="settings-panel hidden">
      <p class="settings-label">
        Public tunnel
        <span id="tunnel-status" class="tunnel-badge tunnel-stopped">stopped</span>
      </p>
      <div class="settings-url-row">
        <input id="tunnel-url" class="settings-url-input" type="text" readonly value="Tunnel inactive" />
        <button id="tunnel-copy" class="settings-btn" disabled>Copy</button>
        <button id="tunnel-toggle" class="settings-btn">Start</button>
      </div>
      <p class="settings-hint settings-warn">
        ⚠ Anyone with this URL gets full pier control, including remote terminal access.
        There is no authentication. Only share with trusted users, and stop the tunnel when done.
      </p>
    </div>

    <div id="settings-panel-about" class="settings-panel hidden">
      <dl class="settings-about">
        <dt>pier version</dt><dd id="settings-version">—</dd>
        <dt>local zellij backend</dt><dd id="settings-zellij-url">—</dd>
      </dl>
    </div>
  </div>
</div>

<style>
.settings-fab {
  position: fixed;
  right: 56px;
  bottom: 14px;
  z-index: 90;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-elev);
  color: var(--accent);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  transition: transform 120ms, border-color 120ms;
}
.settings-fab:hover {
  transform: translateY(-1px);
  border-color: var(--accent);
}
.settings-dialog {
  width: 540px;
  max-width: 96vw;
}
.settings-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.settings-head h2 {
  margin: 0;
  font-size: 16px;
}
.settings-tabs {
  display: flex;
  gap: 4px;
}
.settings-tab {
  background: none;
  border: 1px solid transparent;
  color: var(--fg-dim);
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
}
.settings-tab.active {
  border-color: var(--accent);
  color: var(--accent);
}
.settings-panel {
  padding: 0 2px;
}
.settings-panel.hidden {
  display: none;
}
.settings-label {
  margin: 0 0 8px;
  color: var(--fg-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.settings-url-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.settings-url-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 8px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 12px;
  min-width: 0;
}
.settings-btn {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.settings-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.settings-hint {
  margin: 10px 0 0;
  color: var(--fg-dim);
  font-size: 12px;
  line-height: 1.5;
}
.settings-warn {
  color: #d4a045;
}
.tunnel-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--border);
}
.tunnel-stopped { color: var(--fg-dim); }
.tunnel-starting { color: #d4a045; border-color: #d4a045; }
.tunnel-running { color: #4ec07a; border-color: #4ec07a; }
.tunnel-error { color: #d96666; border-color: #d96666; }
.settings-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-about {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0;
}
.settings-about dt {
  color: var(--fg-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  align-self: center;
}
.settings-about dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 13px;
  word-break: break-all;
}
</style>
`;

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------

let roUrl = "";

type TunnelStatus = "stopped" | "starting" | "running" | "error";
interface TunnelState {
	status: TunnelStatus;
	url: string | null;
	error?: string;
}
let tunnelState: TunnelState = { status: "stopped", url: null };

async function callTunnel(path: string, method: "GET" | "POST"): Promise<TunnelState> {
	const res = await fetch(`${apiBase}${path}`, { method, credentials: "include" });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as TunnelState;
}

function renderTunnel(): void {
	const badge = document.getElementById("tunnel-status");
	const urlInput = document.getElementById("tunnel-url") as HTMLInputElement | null;
	const toggle = document.getElementById("tunnel-toggle") as HTMLButtonElement | null;
	const copy = document.getElementById("tunnel-copy") as HTMLButtonElement | null;
	if (!badge || !urlInput || !toggle || !copy) return;

	badge.textContent = tunnelState.status;
	badge.className = `tunnel-badge tunnel-${tunnelState.status}`;

	if (tunnelState.status === "running" && tunnelState.url) {
		urlInput.value = tunnelState.url;
		toggle.textContent = "Stop";
		toggle.disabled = false;
		copy.disabled = false;
	} else if (tunnelState.status === "starting") {
		urlInput.value = "Starting…";
		toggle.textContent = "Starting…";
		toggle.disabled = true;
		copy.disabled = true;
	} else if (tunnelState.status === "error") {
		urlInput.value = tunnelState.error ?? "Error";
		toggle.textContent = "Retry";
		toggle.disabled = false;
		copy.disabled = true;
	} else {
		urlInput.value = "Tunnel inactive";
		toggle.textContent = "Start";
		toggle.disabled = false;
		copy.disabled = true;
	}
}

async function refreshTunnel(): Promise<void> {
	try {
		tunnelState = await callTunnel("/api/tunnel", "GET");
	} catch {
		tunnelState = { status: "error", url: null, error: "unreachable" };
	}
	renderTunnel();
}

async function fetchReadOnlyUrl(): Promise<string> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: api typed as any at boundary — see api.ts
		const res = await (api as any).settings["zellij-readonly"].$get();
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as {
			access?: string;
			mode?: string;
			url: string;
			tokenName: string;
		};
		if (data.access !== "read-only" || data.mode !== "watch") return "";
		return data.url;
	} catch {
		return "";
	}
}

function setUrlInput(url: string): void {
	const input = document.getElementById("settings-url") as HTMLInputElement | null;
	if (input) input.value = url || "Unavailable";
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

function openSettings(): void {
	const modal = document.getElementById("settings-modal");
	if (modal) modal.classList.remove("hidden");
	// Fetch fresh URL each open
	void fetchReadOnlyUrl().then((url) => {
		roUrl = url;
		setUrlInput(url);
	});
	// Populate about tab
	void populateAbout();
	// Refresh tunnel state
	void refreshTunnel();
}

function closeSettings(): void {
	const modal = document.getElementById("settings-modal");
	if (modal) modal.classList.add("hidden");
}

async function populateAbout(): Promise<void> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: api typed as any at boundary — see api.ts
		const res = await (api as any).version.$get();
		if (res.ok) {
			const data = (await res.json()) as { version?: string };
			const el = document.getElementById("settings-version");
			if (el) el.textContent = data.version ?? "—";
		}
	} catch {
		// leave as —
	}
	const zellijEl = document.getElementById("settings-zellij-url");
	if (zellijEl) zellijEl.textContent = apiBase;
}

// ---------------------------------------------------------------------------
// Wire
// ---------------------------------------------------------------------------

export function wireSettingsModal(): void {
	// exported for callers that want explicit wiring (e.g. index.astro)
	// Inject HTML
	const container = document.createElement("div");
	container.innerHTML = MODAL_HTML;
	// Move style to head, rest to body
	const style = container.querySelector("style");
	if (style) document.head.appendChild(style);
	while (container.firstChild) {
		const node = container.firstChild;
		if (node !== style) document.body.appendChild(node);
		else container.removeChild(node);
	}

	const fab = document.getElementById("settings-fab");
	const modal = document.getElementById("settings-modal");

	fab?.addEventListener("click", openSettings);

	modal?.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.dataset["closeSettings"] !== undefined) closeSettings();
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeSettings();
	});

	// Tabs
	modal?.querySelectorAll<HTMLButtonElement>(".settings-tab").forEach((btn) => {
		btn.addEventListener("click", () => {
			modal.querySelectorAll(".settings-tab").forEach((t) => {
				t.classList.remove("active");
			});
			btn.classList.add("active");
			const tab = btn.dataset["tab"];
			modal.querySelectorAll(".settings-panel").forEach((p) => {
				p.classList.add("hidden");
			});
			const panel = document.getElementById(`settings-panel-${tab}`);
			if (panel) panel.classList.remove("hidden");
		});
	});

	// Copy
	document.getElementById("settings-copy")?.addEventListener("click", () => {
		if (!roUrl) return;
		navigator.clipboard.writeText(roUrl).then(
			() => toast("Copied to clipboard"),
			() => toast("Copy failed"),
		);
	});

	// Regenerate — re-fetches (token rotation is a non-goal; stub re-calls GET)
	document.getElementById("settings-regen")?.addEventListener("click", () => {
		setUrlInput("Refreshing…");
		void fetchReadOnlyUrl().then((url) => {
			roUrl = url;
			setUrlInput(url);
			toast("URL refreshed");
		});
	});

	// Tunnel: toggle start/stop
	document.getElementById("tunnel-toggle")?.addEventListener("click", () => {
		const wasRunning = tunnelState.status === "running";
		tunnelState = wasRunning ? { status: "stopped", url: null } : { status: "starting", url: null };
		renderTunnel();
		const path = wasRunning ? "/api/tunnel/stop" : "/api/tunnel/start";
		void callTunnel(path, "POST")
			.then((next) => {
				tunnelState = next;
				renderTunnel();
				if (next.status === "running") toast("Tunnel started");
				else if (next.status === "stopped" && wasRunning) toast("Tunnel stopped");
				else if (next.status === "error") toast(`Tunnel error: ${next.error ?? ""}`);
			})
			.catch((err: unknown) => {
				tunnelState = {
					status: "error",
					url: null,
					error: err instanceof Error ? err.message : String(err),
				};
				renderTunnel();
				toast("Tunnel request failed");
			});
	});

	// Tunnel: copy URL
	document.getElementById("tunnel-copy")?.addEventListener("click", () => {
		if (!tunnelState.url) return;
		navigator.clipboard.writeText(tunnelState.url).then(
			() => toast("Copied to clipboard"),
			() => toast("Copy failed"),
		);
	});
}
