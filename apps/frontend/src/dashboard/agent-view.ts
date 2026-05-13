/**
 * Agent view panel — mirrors Claude background agent sessions in the browser.
 *
 * Renders three groups (Needs input → Working → Completed) as rows in
 * the right-pane panel. Connects to GET /api/agents/stream (SSE) for
 * live updates. Dispatches new agents via POST /api/agents.
 *
 * Attach surface: clicking "Attach" opens the zellij iframe with
 * `claude attach <shortId>` as the launch command via the zellij panel
 * custom event system.
 */

import { apiBase } from "../api";

// ---------------------------------------------------------------------------
// Types (mirror backend AgentRow)
// ---------------------------------------------------------------------------

type AgentGroup = "working" | "needs-input" | "completed";

interface AgentRow {
	readonly shortId: string;
	readonly group: AgentGroup;
	readonly name: string;
	readonly needs: string | null;
	readonly output: string | null;
	readonly cwd: string;
	readonly updatedAt: string;
	readonly cliVersion: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let agentRows: AgentRow[] = [];
let sseSource: EventSource | null = null;
let panelRoot: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const GROUP_LABELS: Record<AgentGroup, string> = {
	"needs-input": "Needs input",
	working: "Working",
	completed: "Completed",
};

const GROUP_ORDER: readonly AgentGroup[] = ["needs-input", "working", "completed"];

function renderGroupSection(group: AgentGroup, rows: AgentRow[]): HTMLElement {
	const section = document.createElement("div");
	section.className = `agent-group agent-group--${group}`;

	const heading = document.createElement("div");
	heading.className = "agent-group-heading";
	heading.setAttribute("data-group-heading", group);
	heading.textContent = GROUP_LABELS[group];
	section.appendChild(heading);

	if (rows.length === 0) {
		const empty = document.createElement("div");
		empty.className = "agent-group-empty";
		empty.textContent = "—";
		section.appendChild(empty);
		return section;
	}

	for (const row of rows) {
		section.appendChild(renderAgentRow(row));
	}

	return section;
}

function renderAgentRow(row: AgentRow): HTMLElement {
	const el = document.createElement("div");
	el.className = "agent-row";
	el.setAttribute("data-agent-row", row.shortId);

	const info = document.createElement("div");
	info.className = "agent-row-info";
	info.textContent = row.name;
	el.appendChild(info);

	if (row.needs) {
		const needs = document.createElement("div");
		needs.className = "agent-row-needs";
		needs.textContent = row.needs;
		el.appendChild(needs);
	}

	const actions = document.createElement("div");
	actions.className = "agent-row-actions";

	const attachBtn = document.createElement("button");
	attachBtn.className = "agent-row-attach";
	attachBtn.setAttribute("data-attach-button", row.shortId);
	attachBtn.textContent = "Attach";
	attachBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		attachAgent(row.shortId);
	});
	actions.appendChild(attachBtn);

	el.appendChild(actions);

	// Row click → peek panel
	el.addEventListener("click", () => {
		showPeek(row.shortId);
	});

	return el;
}

function render(): void {
	if (!panelRoot) return;
	panelRoot.innerHTML = "";

	const grouped: Record<AgentGroup, AgentRow[]> = {
		"needs-input": [],
		working: [],
		completed: [],
	};

	for (const row of agentRows) {
		grouped[row.group].push(row);
	}

	for (const group of GROUP_ORDER) {
		panelRoot.appendChild(renderGroupSection(group, grouped[group]));
	}

	// Dispatch banner if no daemon
	const noSectionContent =
		grouped["needs-input"].length === 0 &&
		grouped.working.length === 0 &&
		grouped.completed.length === 0;
	if (noSectionContent && panelRoot.dataset["daemonAbsent"] === "true") {
		const banner = document.createElement("div");
		banner.className = "agent-view-banner";
		banner.textContent = "Claude daemon not running. Dispatch an agent to start it.";
		panelRoot.prepend(banner);
	}
}

// ---------------------------------------------------------------------------
// Attach → zellij iframe
// ---------------------------------------------------------------------------

function attachAgent(shortId: string): void {
	// Signal the zellij panel to open `claude attach <shortId>`
	// Uses the same custom event that the terminal panel listens to.
	document.dispatchEvent(
		new CustomEvent("pier:zellij-launch", {
			detail: { command: `claude attach ${shortId}` },
			bubbles: true,
		}),
	);
}

// ---------------------------------------------------------------------------
// Peek panel
// ---------------------------------------------------------------------------

function showPeek(shortId: string): void {
	const url = `${apiBase}/api/agents/${encodeURIComponent(shortId)}/peek`;
	fetch(url)
		.then((r) => r.json())
		.then((data) => {
			const d = data as {
				state?: string;
				needs?: string | null;
				output?: string | null;
				tail?: string;
			};
			document.dispatchEvent(
				new CustomEvent("pier:agent-peek", {
					detail: { shortId, ...d },
					bubbles: true,
				}),
			);
		})
		.catch(() => {
			// Peek failure is non-fatal
		});
}

// ---------------------------------------------------------------------------
// Dispatch new agent
// ---------------------------------------------------------------------------

export async function dispatchAgent(prompt: string): Promise<{ shortId: string } | null> {
	try {
		const res = await fetch(`${apiBase}/api/agents`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt }),
		});
		if (!res.ok) {
			if (res.status === 409 && panelRoot) {
				panelRoot.dataset["daemonAbsent"] = "true";
			}
			return null;
		}
		const data = (await res.json()) as { shortId: string };
		if (panelRoot) panelRoot.dataset["daemonAbsent"] = "false";
		return data;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

function startSSE(): void {
	if (sseSource) return;
	sseSource = new EventSource(`${apiBase}/api/agents/stream`);

	sseSource.addEventListener("agents", (e: Event) => {
		const msg = e as MessageEvent;
		try {
			const rows = JSON.parse(msg.data) as AgentRow[];
			agentRows = rows;
			render();
		} catch {
			// malformed event — ignore
		}
	});

	sseSource.onerror = () => {
		// EventSource auto-reconnects; no action needed
	};
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountAgentView(container: HTMLElement): void {
	panelRoot = container;
	panelRoot.className = "agent-view";
	render();
	startSSE();
}

export function unmountAgentView(): void {
	if (sseSource) {
		sseSource.close();
		sseSource = null;
	}
	panelRoot = null;
	agentRows = [];
}

export function getAgentRowCount(): number {
	return agentRows.length;
}
