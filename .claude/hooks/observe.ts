/**
 * Observability: append a structured event to .claude/traces/<session>.jsonl.
 * Must never throw — trace emission failures must not break the harness.
 *
 * v2 (011): each emitted line carries span-hierarchy fields (span_id,
 * parent_span_id, started_at, duration_ms, status). Pending PreToolUse spans
 * are persisted in .claude/traces/.spans-<session>.json so a subsequent
 * PostToolUse (distinct hook process) can pair up and compute duration_ms.
 *
 * Absence of crypto.randomUUID (or any IO error) must not raise — we fall
 * back to undefined new fields, preserving backward compat.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseEvent, ToolEvent } from "./types";

function genSpanId(): string | undefined {
	try {
		return crypto.randomUUID();
	} catch {
		return undefined;
	}
}

function pendingPath(dir: string, sessionId: string): string {
	return join(dir, `.spans-${sessionId}.json`);
}

interface PendingEntry {
	span_id: string;
	started_at: number;
}
type PendingMap = Record<string, PendingEntry>;

function readPending(path: string): PendingMap {
	try {
		if (!existsSync(path)) return {};
		const raw = readFileSync(path, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== "object") return {};
		const out: PendingMap = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (v === null || typeof v !== "object") continue;
			const rec: Record<string, unknown> = v;
			if (typeof rec.span_id === "string" && typeof rec.started_at === "number") {
				out[k] = { span_id: rec.span_id, started_at: rec.started_at };
			}
		}
		return out;
	} catch {
		return {};
	}
}

function writePending(path: string, map: PendingMap): void {
	try {
		writeFileSync(path, JSON.stringify(map));
	} catch {
		// never throw
	}
}

function readToolName(event: BaseEvent): string | undefined {
	const rec: Record<string, unknown> = event;
	const name = rec.tool_name;
	return typeof name === "string" ? name : undefined;
}

function readToolResponse(event: BaseEvent): Record<string, unknown> | undefined {
	const rec: Record<string, unknown> = event;
	const resp = rec.tool_response;
	if (resp === null || typeof resp !== "object") return undefined;
	return resp;
}

function inferStatus(
	hookEventName: string,
	toolResponse: Record<string, unknown> | undefined,
): "ok" | "error" | "blocked" | undefined {
	if (hookEventName !== "PostToolUse") return undefined;
	if (toolResponse === undefined) return "ok";
	if (toolResponse.is_error === true) return "error";
	return "ok";
}

/**
 * Emit a ToolBlocked point-event to .claude/traces/<session>.jsonl.
 * Never throws — mirrors emitTrace() never-throw contract.
 * observe.ts is the single writer to .jsonl; enforce.ts must not call fs write functions directly.
 */
export function emitBlocked(
	event: ToolEvent,
	reason: string,
	tool: string,
	filePath: string,
): void {
	try {
		const dir = join(event.cwd, ".claude", "traces");
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		const spanId = genSpanId();
		const line = JSON.stringify({
			ts: new Date().toISOString(),
			session_id: event.session_id,
			event: "ToolBlocked",
			agent_id: event.agent_id ?? null,
			span_id: spanId,
			status: "blocked",
			tool,
			file: filePath,
			reason,
		});
		appendFileSync(join(dir, `${event.session_id}.jsonl`), `${line}\n`);
	} catch {
		// trace emission must never break the harness
	}
}

export function emitTrace(event: BaseEvent, extra: Record<string, unknown>): void {
	try {
		const dir = join(event.cwd, ".claude", "traces");
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

		const now = Date.now();
		const spanId = genSpanId();
		const toolName = readToolName(event);
		const toolResponse = readToolResponse(event);
		const pendingFile = pendingPath(dir, event.session_id);

		let parentSpanId: string | undefined;
		let startedAt: number | undefined;
		let durationMs: number | undefined;

		if (toolName !== undefined) {
			const pending = readPending(pendingFile);
			const key = toolName;
			if (event.hook_event_name === "PreToolUse") {
				startedAt = now;
				if (spanId !== undefined) {
					pending[key] = { span_id: spanId, started_at: now };
					writePending(pendingFile, pending);
				}
			} else if (event.hook_event_name === "PostToolUse") {
				const match = pending[key];
				if (match !== undefined) {
					parentSpanId = match.span_id;
					startedAt = match.started_at;
					durationMs = now - match.started_at;
					delete pending[key];
					writePending(pendingFile, pending);
				}
			}
		}

		const status = inferStatus(event.hook_event_name, toolResponse);

		const line = JSON.stringify({
			ts: new Date().toISOString(),
			session_id: event.session_id,
			event: event.hook_event_name,
			agent_id: event.agent_id ?? null,
			span_id: spanId,
			parent_span_id: parentSpanId,
			started_at: startedAt,
			duration_ms: durationMs,
			status,
			...extra,
		});
		appendFileSync(join(dir, `${event.session_id}.jsonl`), `${line}\n`);
	} catch {
		// trace emission must never break the harness
	}
}
