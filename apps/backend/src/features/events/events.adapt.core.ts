export type EventCategory = "agent" | "tool" | "text" | "thinking" | "error" | "other";

export type PiEvent = {
	ts: number;
	project: string;
	run?: string;
	kind: string;
	category?: EventCategory;
	source?: string;
	uuid?: string;
	role?: string;
	text?: string;
	tool?: string;
	name?: string;
	tool_id?: string;
	input?: unknown;
	status?: "ok" | "error";
	ok?: boolean;
	result?: unknown;
};

export const AGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
	"Agent",
	"Task",
	"TeamCreate",
	"TeamDelete",
	"SendMessage",
]);

type AdaptContext = {
	project: string;
	session: string;
};

type ClaudeEntry = {
	type?: string;
	timestamp?: string;
	cwd?: string;
	sessionId?: string;
	uuid?: string;
	message?: { role?: string; content?: unknown };
};

const previewContent = (content: unknown): string | undefined => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	const parts: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const b = block as Record<string, unknown>;
		if (b["type"] === "text" && typeof b["text"] === "string") parts.push(b["text"]);
	}
	return parts.length ? parts.join("\n") : undefined;
};

const adaptToolUse = (base: PiEvent, b: Record<string, unknown>): PiEvent => {
	const name = typeof b["name"] === "string" ? b["name"] : "?";
	const isAgent = AGENT_TOOL_NAMES.has(name);
	const out: PiEvent = {
		...base,
		kind: isAgent ? "claude:agent_use" : "claude:tool_use",
		category: isAgent ? "agent" : "tool",
		tool: name,
		name,
		input: b["input"],
	};
	if (typeof b["id"] === "string") out.tool_id = b["id"];
	return out;
};

const adaptToolResult = (base: PiEvent, b: Record<string, unknown>): PiEvent => {
	const isErr = b["is_error"] === true;
	const out: PiEvent = {
		...base,
		kind: "claude:tool_result",
		category: isErr ? "error" : "tool",
		status: isErr ? "error" : "ok",
		ok: !isErr,
		result: b["content"],
	};
	if (typeof b["tool_use_id"] === "string") out.tool_id = b["tool_use_id"];
	const preview = previewContent(b["content"]);
	if (preview !== undefined) out.text = preview;
	return out;
};

const adaptText = (base: PiEvent, b: Record<string, unknown>): PiEvent | null => {
	const text = typeof b["text"] === "string" ? b["text"] : "";
	if (!text.trim()) return null;
	return { ...base, kind: "claude:text", category: "text", text };
};

const adaptThinking = (base: PiEvent, b: Record<string, unknown>): PiEvent => {
	const text = typeof b["thinking"] === "string" ? b["thinking"] : "";
	return { ...base, kind: "claude:thinking", category: "thinking", text };
};

const ADAPTERS: Record<string, (base: PiEvent, b: Record<string, unknown>) => PiEvent | null> = {
	tool_use: adaptToolUse,
	tool_result: adaptToolResult,
	text: adaptText,
	thinking: adaptThinking,
};

const adaptBlocks = (base: PiEvent, blocks: unknown[]): PiEvent[] => {
	const out: PiEvent[] = [];
	for (const block of blocks) {
		if (!block || typeof block !== "object") continue;
		const b = block as Record<string, unknown>;
		const bt = b["type"];
		const adapter = typeof bt === "string" ? ADAPTERS[bt] : undefined;
		if (!adapter) continue;
		const result = adapter(base, b);
		if (result) out.push(result);
	}
	return out;
};

export const adapt = (rawJsonlLine: unknown, ctx: AdaptContext): PiEvent | null => {
	if (!rawJsonlLine || typeof rawJsonlLine !== "object") return null;
	const entry = rawJsonlLine as ClaudeEntry;
	if (!entry.type) return null;

	const parsed = entry.timestamp ? Date.parse(entry.timestamp) : Number.NaN;
	const ts = Number.isFinite(parsed) ? parsed : Date.now();
	const base: PiEvent = {
		ts,
		project: ctx.project,
		run: ctx.session,
		kind: `claude:${entry.type}`,
	};
	if (entry.sessionId) base.source = entry.sessionId;
	if (entry.uuid) base.uuid = entry.uuid;
	if (entry.message?.role) base.role = entry.message.role;

	const content = entry.message?.content;
	if (typeof content === "string") {
		if (content.trim()) base.text = content;
		return base;
	}
	if (!Array.isArray(content)) return base;

	const blocks = adaptBlocks(base, content);
	return blocks.length ? (blocks[0] ?? null) : base;
};
