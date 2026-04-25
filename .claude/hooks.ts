/**
 * Central hook dispatcher for Claude Code.
 *
 * Every hook event in .claude/settings.json points here.
 * stdin carries the event JSON — we read `hook_event_name` and route internally.
 */

// ── Types ────────────────────────────────────────────────────────────

interface BaseEvent {
	session_id: string;
	transcript_path: string;
	cwd: string;
	hook_event_name: string;
	permission_mode: string;
	agent_id?: string;
	agent_type?: string;
}

interface ToolEvent extends BaseEvent {
	hook_event_name: "PreToolUse" | "PostToolUse" | "PostToolUseFailure";
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_response?: Record<string, unknown>;
}

interface SessionEvent extends BaseEvent {
	hook_event_name: "SessionStart" | "SessionEnd";
	source?: string;
}

interface PromptEvent extends BaseEvent {
	hook_event_name: "UserPromptSubmit";
	prompt: string;
}

interface NotificationEvent extends BaseEvent {
	hook_event_name: "Notification";
}

interface FileChangedEvent extends BaseEvent {
	hook_event_name: "FileChanged";
	file_path: string;
	change_type: "created" | "modified" | "deleted";
}

interface StopEvent extends BaseEvent {
	hook_event_name: "Stop" | "StopFailure";
}

interface SubagentEvent extends BaseEvent {
	hook_event_name: "SubagentStart" | "SubagentStop";
}

interface CompactEvent extends BaseEvent {
	hook_event_name: "PreCompact" | "PostCompact";
}

type HookEvent =
	| ToolEvent
	| SessionEvent
	| PromptEvent
	| NotificationEvent
	| FileChangedEvent
	| StopEvent
	| SubagentEvent
	| CompactEvent
	| BaseEvent;

// ── Helpers ──────────────────────────────────────────────────────────

function block(reason: string): never {
	console.error(reason);
	process.exit(2);
}

function respond(output: Record<string, unknown>) {
	console.log(JSON.stringify(output));
}

async function run(cmd: string[]): Promise<boolean> {
	const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
	return (await proc.exited) === 0;
}

// ── Event Handlers ───────────────────────────────────────────────────

function onPreToolUse(event: ToolEvent) {
	const filePath = event.tool_input.file_path as string | undefined;
	if (!filePath) return;

	// Block edits to api-contract — it's auto-derived from backend AppType
	if (filePath.includes("/packages/api-contract/")) {
		block(
			"api-contract is auto-derived from backend AppType — never edit it manually. Change the backend routes instead.",
		);
	}
}

async function onPostToolUse(event: ToolEvent) {
	const filePath =
		((event.tool_response?.filePath as string) ?? event.tool_input.file_path) as
			| string
			| undefined;
	if (!filePath) return;

	// 1. Biome lint/format
	await run(["bun", "run", "lint:file", filePath]);

	// 2. Colocated-tests check — only for .ts files in apps/ or packages/
	if (
		(filePath.includes("/apps/") || filePath.includes("/packages/")) &&
		filePath.endsWith(".ts") &&
		!filePath.endsWith(".d.ts")
	) {
		const { existsSync } = await import("node:fs");

		if (filePath.endsWith(".test.ts")) {
			const src = filePath.replace(/\.test\.ts$/, ".ts");
			if (!existsSync(src)) {
				respond({
					systemMessage: `Orphaned test: no matching source file for ${filePath}`,
				});
				return;
			}
		} else {
			const testFile = filePath.replace(/\.ts$/, ".test.ts");
			if (!existsSync(testFile)) {
				respond({
					systemMessage: `Note: ${filePath} has no colocated test file`,
				});
				return;
			}
		}
	}

	// 3. Typecheck the affected workspace
	if (filePath.includes("/apps/backend/")) {
		await run(["turbo", "typecheck", "--filter=backend"]);
	} else if (filePath.includes("/apps/frontend/")) {
		await run(["turbo", "typecheck", "--filter=frontend"]);
	}
}

// ── Dispatcher ───────────────────────────────────────────────────────

const input = await Bun.stdin.text();
const event: HookEvent = JSON.parse(input);

switch (event.hook_event_name) {
	case "PreToolUse":
		onPreToolUse(event as ToolEvent);
		break;
	case "PostToolUse":
		await onPostToolUse(event as ToolEvent);
		break;
	// Add new event handlers here:
	// case "UserPromptSubmit":
	// case "SessionStart":
	// case "FileChanged":
	// etc.
}
