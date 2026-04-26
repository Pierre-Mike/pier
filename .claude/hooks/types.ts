/**
 * Hook event types. Mirror the Claude Code event payloads that arrive on stdin.
 */

export interface BaseEvent {
	session_id: string;
	transcript_path: string;
	cwd: string;
	hook_event_name: string;
	permission_mode?: string;
	agent_id?: string;
}

export interface ToolEvent extends BaseEvent {
	hook_event_name: "PreToolUse" | "PostToolUse";
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_response?: Record<string, unknown>;
}

/**
 * Optional span-hierarchy and status fields added by observe.ts to each emitted
 * trace line. Old jsonl lines won't carry these; consumers must treat every
 * field as optional to preserve backward compatibility.
 */
export interface SpanFields {
	span_id?: string;
	parent_span_id?: string;
	started_at?: number;
	duration_ms?: number;
	status?: "ok" | "error" | "blocked";
}

export type HookEvent = ToolEvent | BaseEvent;

export function isToolEvent(event: HookEvent): event is ToolEvent {
	return event.hook_event_name === "PreToolUse" || event.hook_event_name === "PostToolUse";
}

/**
 * Thrown by `block()` after emitting a ToolBlocked trace line.
 * The top-level catch-all in enforcePreToolUse translates this to process.exit(2).
 */
export class BlockError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = "BlockError";
	}
}

/**
 * Emit a ToolBlocked trace event via observe.ts, then throw BlockError.
 * The top-level catch-all in enforcePreToolUse translates BlockError → process.exit(2).
 * Never exits directly — keeps the block-vs-bug distinction.
 */
export function block(event: ToolEvent, reason: string, filePath: string): never {
	// Lazy import to avoid circular dep at module load time; emitBlocked never throws.
	// We use a dynamic require-style import synchronously via Bun's module system.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { emitBlocked } = require("./observe") as {
		emitBlocked: (event: ToolEvent, reason: string, tool: string, filePath: string) => void;
	};
	const tool = typeof event?.tool_name === "string" ? event.tool_name : "Write";
	emitBlocked(event, reason, tool, filePath);
	console.error(reason);
	throw new BlockError(reason);
}

export async function run(cmd: string[]): Promise<boolean> {
	const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
	return (await proc.exited) === 0;
}
