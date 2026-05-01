/**
 * Logs modal — Claude activity stream
 */
import { api } from "../api";
import { store } from "./state";
import type { ClaudeEvent } from "./types";
import { $, escapeAttr, escapeHTML, fmtDur, fmtTime } from "./utils";

export async function loadLogsHistory(): Promise<void> {
	const project = store.logsProject || "";
	const session = store.logsSession || "";
	store.logsHistoryLoading = true;
	store.logsHistoryScope = { project, session };

	try {
		const query: Record<string, string> = { limit: "5000" };
		if (project) query.project = project;
		if (session) query.session = session;

		const res = await api.api.logs.$get({ query });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { events: ClaudeEvent[] };

		if (
			store.logsHistoryScope?.project === project &&
			store.logsHistoryScope?.session === session
		) {
			store.logsHistory = Array.isArray(data.events) ? data.events : [];
			for (const e of store.logsHistory) indexToolUse(e);
		}
	} catch {
		store.logsHistory = [];
	} finally {
		store.logsHistoryLoading = false;
		if (store.logsFollow) scrollLogsToBottom();
	}
}

async function openLogs(): Promise<void> {
	store.logsOpen = true;
	store.logsHasNew = false;
	$("#logs-fab").classList.remove("has-new");
	$("#logs-modal").classList.remove("hidden");
	store.logsProject = store.activeProject ?? "";
	store.logsSession = "";
	refreshLogsProjectOptions();
	refreshLogsSessionOptions();
	const projSelect = document.getElementById("logs-project") as HTMLSelectElement | null;
	if (projSelect) projSelect.value = store.logsProject;
	await loadLogsHistory();
	requestAnimationFrame(scrollLogsToBottom);
}

function closeLogs(): void {
	store.logsOpen = false;
	$("#logs-modal").classList.add("hidden");
}

function indexToolUse(evt: ClaudeEvent): void {
	if ((evt.kind === "claude:tool_use" || evt.kind === "claude:agent_use") && evt.tool_id) {
		store.toolUseMap.set(evt.tool_id, { ts: evt.ts, name: evt.name ?? evt.tool ?? "" });
	}
}

export function pushLog(evt: ClaudeEvent): void {
	store.logs.push(evt);
	if (store.logs.length > store.logsMax) store.logs.shift();
	indexToolUse(evt);

	if (!store.logsOpen) {
		store.logsHasNew = true;
		$("#logs-fab").classList.add("has-new");
		return;
	}

	if (matchesLogFilters(evt)) {
		appendLogRow(evt);
		if (store.logsFollow) scrollLogsToBottom();
	}

	refreshLogsProjectOptions();
	refreshLogsSessionOptions();
}

function matchesLogFilters(evt: ClaudeEvent): boolean {
	if (store.logsProject && evt.project !== store.logsProject) return false;
	if (store.logsSession && evt.run !== store.logsSession) return false;
	if (store.logsTab === "tools" && evt.category !== "tool") return false;
	if (store.logsTab === "agents" && evt.category !== "agent") return false;
	if (store.logsTab === "errors" && evt.category !== "error") return false;
	if (!store.logsFilter) return true;

	const hay = [
		evt.kind,
		evt.project,
		evt.run,
		evt.name,
		evt.tool,
		evt.text,
		evt.input ? JSON.stringify(evt.input) : "",
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	return hay.includes(store.logsFilter);
}

function mergedLogs(): ClaudeEvent[] {
	const seen = new Set<string>();
	const out: ClaudeEvent[] = [];
	for (const e of store.logsHistory) {
		const k = rowKey(e);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(e);
	}
	for (const e of store.logs) {
		const k = rowKey(e);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(e);
	}
	out.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
	return out;
}

export function renderLogs(): void {
	const tbody = $("#logs-tbody");
	tbody.innerHTML = "";

	if (store.logsHistoryLoading) {
		const tr = document.createElement("tr");
		tr.innerHTML = `<td colspan="7" style="padding:16px;color:var(--fg-dim);text-align:center">loading history…</td>`;
		tbody.appendChild(tr);
		return;
	}

	const rows = mergedLogs().filter(matchesLogFilters);
	const frag = document.createDocumentFragment();
	for (const e of rows) {
		const tr = logRow(e);
		frag.appendChild(tr);
		const key = rowKey(e);
		if (store.logsExpanded.has(key)) frag.appendChild(detailRow(e));
	}
	tbody.appendChild(frag);
	if (store.logsFollow) scrollLogsToBottom();
}

function appendLogRow(evt: ClaudeEvent): void {
	$("#logs-tbody").appendChild(logRow(evt));
}

function rowKey(evt: ClaudeEvent): string {
	return `${evt.ts}|${evt.uuid ?? ""}|${evt.tool_id ?? ""}|${evt.kind}`;
}

function kindBadge(evt: ClaudeEvent): string {
	if (evt.kind === "claude:agent_use") return `<span class="badge agent">agent</span>`;
	if (evt.kind === "claude:tool_use") return `<span class="badge tool">tool</span>`;
	if (evt.kind === "claude:tool_result") {
		const err = evt.ok === false || evt.status === "error";
		return `<span class="badge result${err ? " err" : ""}">result</span>`;
	}
	if (evt.kind === "claude:text")
		return `<span class="badge text">${escapeHTML(evt.role ?? "msg")}</span>`;
	if (evt.kind === "claude:thinking") return `<span class="badge think">think</span>`;
	return `<span class="badge text">${escapeHTML(String(evt.kind ?? "").replace(/^claude:/, ""))}</span>`;
}

function logRow(evt: ClaudeEvent): HTMLTableRowElement {
	const tr = document.createElement("tr");
	tr.dataset.key = rowKey(evt);
	const err = isErrEvt(evt);
	if (err) tr.classList.add("err");

	const ts = new Date(evt.ts ?? Date.now());
	const sess = evt.run ? String(evt.run).slice(0, 8) : "";
	const name =
		evt.name ??
		evt.tool ??
		(evt.kind === "claude:tool_result"
			? (store.toolUseMap.get(evt.tool_id ?? "")?.name ?? "")
			: "");
	const dur = durationFor(evt);
	const status =
		evt.kind === "claude:tool_result"
			? err
				? `<span class="status-err">err</span>`
				: `<span class="status-ok">ok</span>`
			: "";
	const preview = detailsPreview(evt);

	tr.innerHTML = `
    <td class="c-ts">${escapeHTML(fmtTime(ts))}</td>
    <td class="c-sess" title="${escapeAttr(String(evt.run ?? ""))}">${escapeHTML(sess)}</td>
    <td>${kindBadge(evt)}</td>
    <td class="c-tool">${escapeHTML(String(name))}</td>
    <td>${status}</td>
    <td class="c-dur">${dur != null ? escapeHTML(fmtDur(dur)) : ""}</td>
    <td class="c-details" title="${escapeAttr(preview)}">${escapeHTML(preview)}</td>`;
	return tr;
}

function isErrEvt(e: ClaudeEvent): boolean {
	return e.status === "error" || e.ok === false || String(e.kind ?? "").includes("error");
}

function durationFor(evt: ClaudeEvent): number | null {
	if (evt.duration_ms != null) return evt.duration_ms;
	if (evt.kind === "claude:tool_result" && evt.tool_id) {
		const tu = store.toolUseMap.get(evt.tool_id);
		if (tu) return evt.ts - tu.ts;
	}
	return null;
}

function detailsPreview(evt: ClaudeEvent): string {
	if (evt.kind === "claude:tool_use" || evt.kind === "claude:agent_use") {
		return summarizeInput(evt.input);
	}
	if (evt.kind === "claude:tool_result") {
		return String(evt.text ?? "")
			.replace(/\s+/g, " ")
			.slice(0, 280);
	}
	if (evt.text) return String(evt.text).replace(/\s+/g, " ").slice(0, 280);
	return "";
}

function summarizeInput(input: unknown): string {
	if (input == null) return "";
	if (typeof input === "string") return input.slice(0, 280);
	if (typeof input !== "object") return String(input);

	const keys = [
		"description",
		"prompt",
		"command",
		"file_path",
		"path",
		"pattern",
		"query",
		"url",
		"subagent_type",
	];
	const parts: string[] = [];
	for (const k of keys) {
		const v = (input as Record<string, unknown>)[k];
		if (v == null) continue;
		const s = typeof v === "string" ? v : JSON.stringify(v);
		parts.push(`${k}=${s.slice(0, 140)}`);
		if (parts.join(" ").length > 280) break;
	}
	if (parts.length === 0) {
		try {
			return JSON.stringify(input).slice(0, 280);
		} catch {
			return "";
		}
	}
	return parts.join(" · ");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Event detail formatting by kind
function buildDetailSections(evt: ClaudeEvent): Array<[string, string]> {
	const sections: Array<[string, string]> = [];
	if (evt.kind === "claude:tool_use" || evt.kind === "claude:agent_use") {
		sections.push(["Input", safeJSON(evt.input)]);
	} else if (evt.kind === "claude:tool_result") {
		const tu = evt.tool_id ? store.toolUseMap.get(evt.tool_id) : null;
		if (tu) sections.push(["Called", `${tu.name}`]);
		sections.push([
			evt.ok === false ? "Error" : "Result",
			String(evt.text ?? safeJSON(evt.result)),
		]);
	} else if (evt.text) {
		sections.push([evt.role ?? "Text", String(evt.text)]);
	} else {
		sections.push(["Event", safeJSON(evt)]);
	}
	sections.push([
		"Meta",
		`session=${evt.run ?? ""}\nproject=${evt.project ?? ""}\nuuid=${evt.uuid ?? ""}\nsource=${evt.source ?? ""}`,
	]);
	return sections;
}

function detailRow(evt: ClaudeEvent): HTMLTableRowElement {
	const tr = document.createElement("tr");
	tr.className = "logs-detail-row";
	const box = document.createElement("td");
	box.colSpan = 7;
	const inner = document.createElement("div");
	inner.className = "detail-box";

	const sections = buildDetailSections(evt);
	inner.innerHTML = sections
		.map(([h, body]) => `<div class="sect">${escapeHTML(h)}</div><div>${escapeHTML(body)}</div>`)
		.join("");
	box.appendChild(inner);
	tr.appendChild(box);
	return tr;
}

function safeJSON(v: unknown): string {
	if (v == null) return "";
	try {
		return JSON.stringify(v, null, 2);
	} catch {
		return String(v);
	}
}

export function renderLogsCards(): void {
	const scope = mergedLogs().filter((e) => {
		if (store.logsProject && e.project !== store.logsProject) return false;
		if (store.logsSession && e.run !== store.logsSession) return false;
		return true;
	});

	const sessions = new Set<string>();
	let tools = 0;
	let agents = 0;
	let errors = 0;

	for (const e of scope) {
		if (e.run) sessions.add(e.run);
		if (e.kind === "claude:tool_use") tools++;
		else if (e.kind === "claude:agent_use") agents++;
		if (isErrEvt(e)) errors++;
	}

	const el = $("#logs-cards");
	el.innerHTML = `
    <div class="logs-card sessions"><div class="lc-label">sessions</div><div class="lc-value">${sessions.size}</div><div class="lc-sub">${scope.length} events</div></div>
    <div class="logs-card tools"><div class="lc-label">tool calls</div><div class="lc-value">${tools}</div></div>
    <div class="logs-card agents"><div class="lc-label">agent calls</div><div class="lc-value">${agents}</div></div>
    <div class="logs-card errors"><div class="lc-label">errors</div><div class="lc-value">${errors}</div></div>`;
}

function refreshLogsProjectOptions(): void {
	const sel = document.getElementById("logs-project") as HTMLSelectElement | null;
	if (!sel) return;

	const current = sel.value;
	const set = new Set(
		[...store.logs, ...store.logsHistory].map((e) => e.project).filter((p): p is string => !!p),
	);
	for (const p of store.projects ?? []) if (p?.id) set.add(p.id);

	const known = new Set([...sel.options].map((o) => o.value).filter((v): v is string => !!v));
	const same = set.size === known.size && [...set].every((p) => known.has(p));
	if (same) return;

	sel.innerHTML =
		`<option value="">all projects</option>` +
		[...set]
			.sort()
			.map((p) => `<option value="${escapeAttr(p)}">${escapeHTML(p)}</option>`)
			.join("");
	sel.value = current;
}

function refreshLogsSessionOptions(): void {
	const sel = document.getElementById("logs-session") as HTMLSelectElement | null;
	if (!sel) return;

	const current = sel.value;
	const all = [...store.logsHistory, ...store.logs];
	const scope = store.logsProject ? all.filter((e) => e.project === store.logsProject) : all;
	const set = new Set(scope.map((e) => e.run).filter((r): r is string => !!r));

	const known = new Set([...sel.options].map((o) => o.value).filter((v): v is string => !!v));
	const same = set.size === known.size && [...set].every((p) => known.has(p));
	if (same) return;

	sel.innerHTML =
		`<option value="">all sessions</option>` +
		[...set]
			.sort()
			.map((s) => `<option value="${escapeAttr(s)}">${escapeHTML(s.slice(0, 8))}</option>`)
			.join("");
	sel.value = set.has(current) ? current : "";
	store.logsSession = sel.value;
}

function scrollLogsToBottom(): void {
	const body = document.getElementById("logs-body");
	if (body) body.scrollTop = body.scrollHeight;
}

export function wireLogsModal(): void {
	const fab = $("#logs-fab");
	const modal = $("#logs-modal");

	fab.addEventListener("click", () => void openLogs());
	modal.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.dataset && target.dataset.closeLogs !== undefined) closeLogs();
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && store.logsOpen) closeLogs();
	});

	const logsFilter = document.getElementById("logs-filter") as HTMLInputElement | null;
	if (logsFilter) {
		logsFilter.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			store.logsFilter = target.value.toLowerCase();
		});
	}

	const logsProject = document.getElementById("logs-project") as HTMLSelectElement | null;
	if (logsProject) {
		logsProject.addEventListener("change", (e) => {
			const target = e.target as HTMLSelectElement;
			store.logsProject = target.value;
			store.logsSession = "";
			refreshLogsSessionOptions();
			void loadLogsHistory();
		});
	}

	const logsSession = document.getElementById("logs-session") as HTMLSelectElement | null;
	if (logsSession) {
		logsSession.addEventListener("change", (e) => {
			const target = e.target as HTMLSelectElement;
			store.logsSession = target.value;
			void loadLogsHistory();
		});
	}

	const logsFollow = document.getElementById("logs-follow") as HTMLInputElement | null;
	if (logsFollow) {
		logsFollow.addEventListener("change", (e) => {
			const target = e.target as HTMLInputElement;
			store.logsFollow = target.checked;
			if (store.logsFollow) scrollLogsToBottom();
		});
	}

	const logsClear = document.getElementById("logs-clear");
	if (logsClear) {
		logsClear.addEventListener("click", () => {
			$("#logs-tbody").innerHTML = "";
		});
	}

	for (const tab of document.querySelectorAll(".logs-tab")) {
		tab.addEventListener("click", () => {
			const target = tab as HTMLElement;
			store.logsTab = target.dataset.tab ?? "all";
			for (const t of document.querySelectorAll(".logs-tab")) {
				t.classList.toggle("active", t === tab);
			}
		});
	}

	const logsTbody = document.getElementById("logs-tbody");
	if (logsTbody) {
		logsTbody.addEventListener("click", (e) => {
			const tr = (e.target as HTMLElement).closest("tr[data-key]") as HTMLElement | null;
			if (!tr) return;
			const key = tr.dataset.key;
			if (!key) return;
			if (store.logsExpanded.has(key)) {
				store.logsExpanded.delete(key);
			} else {
				store.logsExpanded.add(key);
			}
		});
	}
}
