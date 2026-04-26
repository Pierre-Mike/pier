/**
 * Central hook dispatcher. Reads one event from stdin and routes it.
 * Enforcement lives in hooks/enforce.ts, observability in hooks/observe.ts,
 * post-edit verification in hooks/verify.ts.
 *
 * Fail-closed discipline:
 *   Any uncaught throw or malformed JSON on stdin must exit with code 2 so
 *   Claude Code treats it as "blocked." A default exit 1 (bun's response to
 *   an uncaught throw) would be read as "hook ran fine, allow" and silently
 *   let the tool call through. Register process-level listeners + wrap parse
 *   and dispatch in a single try/catch.
 */

import { enforcePreToolUse } from "./hooks/enforce";
import { emitTrace } from "./hooks/observe";
import { type HookEvent, isToolEvent, type ToolEvent } from "./hooks/types";
import { verifyPostToolUse } from "./hooks/verify";

function failClosed(reason: string): never {
	console.error(`hook dispatcher failed closed: ${reason}`);
	process.exit(2);
}

process.on("uncaughtException", (err: Error) => {
	failClosed(`uncaughtException: ${err.message}`);
});
process.on("unhandledRejection", (err: unknown) => {
	const msg = err instanceof Error ? err.message : String(err);
	failClosed(`unhandledRejection: ${msg}`);
});

function parseEvent(input: string): HookEvent {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		failClosed(`malformed JSON on stdin: ${msg}`);
	}
	if (typeof parsed !== "object" || parsed === null) {
		failClosed("event not an object");
	}
	const obj = parsed as Record<string, unknown>;
	if (typeof obj.hook_event_name !== "string") {
		failClosed("event missing hook_event_name: string");
	}
	return parsed as HookEvent;
}

function traceExtra(e: HookEvent): Record<string, unknown> {
	if (!isToolEvent(e)) return {};
	const filePath = (e.tool_input.file_path as string | undefined) ?? null;
	return { tool: e.tool_name, file: filePath };
}

try {
	const input = await Bun.stdin.text();
	const event = parseEvent(input);
	emitTrace(event, traceExtra(event));

	if (isToolEvent(event)) {
		const toolEvent: ToolEvent = event;
		switch (toolEvent.hook_event_name) {
			case "PreToolUse":
				enforcePreToolUse(toolEvent);
				break;
			case "PostToolUse":
				await verifyPostToolUse(toolEvent);
				break;
		}
	}
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	failClosed(`dispatch error: ${msg}`);
}
