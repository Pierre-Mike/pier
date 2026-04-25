// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess throughout file
export type EventCategory = "agent" | "tool" | "text" | "thinking" | "error" | "other";

export type PiEvent = {
	ts: number;
	project: string;
	run?: string;
	kind: string;
	category?: EventCategory;
	source?: string;
	[k: string]: unknown;
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

// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess
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

// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess
const adaptToolUse = (base: PiEvent, b: Record<string, unknown>): PiEvent => {
	const name = typeof b["name"] === "string" ? b["name"] : "?";
	const isAgent = AGENT_TOOL_NAMES.has(name);
	return {
		...base,
		kind: isAgent ? "claude:agent_use" : "claude:tool_use",
		category: isAgent ? "agent" : "tool",
		tool: name,
		name,
		tool_id: typeof b["id"] === "string" ? b["id"] : undefined,
		input: b["input"],
	};
};

// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess
const adaptToolResult = (base: PiEvent, b: Record<string, unknown>): PiEvent => {
	const isErr = b["is_error"] === true;
	return {
		...base,
		kind: "claude:tool_result",
		category: isErr ? "error" : "tool",
		tool_id: typeof b["tool_use_id"] === "string" ? b["tool_use_id"] : undefined,
		status: isErr ? "error" : "ok",
		ok: !isErr,
		text: previewContent(b["content"]),
		result: b["content"],
	};
};

// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess
const adaptBlocks = (base: PiEvent, blocks: unknown[]): PiEvent[] => {
	const out: PiEvent[] = [];
	for (const block of blocks) {
		if (!block || typeof block !== "object") continue;
		const b = block as Record<string, unknown>;
		const bt = b["type"];
		if (bt === "tool_use") {
			out.push(adaptToolUse(base, b));
		} else if (bt === "tool_result") {
			out.push(adaptToolResult(base, b));
		} else if (bt === "text") {
			const text = typeof b["text"] === "string" ? b["text"] : "";
			if (text.trim()) out.push({ ...base, kind: "claude:text", category: "text", text });
		} else if (bt === "thinking") {
			const text = typeof b["thinking"] === "string" ? b["thinking"] : "";
			out.push({ ...base, kind: "claude:thinking", category: "thinking", text });
		}
	}
	return out;
};

// biome-ignore lint/complexity/useLiteralKeys: bracket notation required for TS noUncheckedIndexedAccess
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
	if (entry.uuid) base["uuid"] = entry.uuid;
	if (entry.message?.role) base["role"] = entry.message.role;

	const content = entry.message?.content;
	if (typeof content === "string") {
		if (content.trim()) base["text"] = content;
		return base;
	}
	if (!Array.isArray(content)) return base;

	const blocks = adaptBlocks(base, content);
	return blocks.length ? (blocks[0] ?? null) : base;
};
