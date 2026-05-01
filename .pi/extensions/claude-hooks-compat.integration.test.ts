import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import claudeHooksCompat, {
	type PiApi,
	type PiContext,
	type PiEvent,
	type PiEventResult,
} from "./claude-hooks-compat.ts";

interface RegisteredHandler {
	readonly eventName: string;
	readonly handler: (
		event: PiEvent,
		ctx: PiContext,
	) => Promise<PiEventResult | undefined> | PiEventResult | undefined;
}

function makeHarness(): { readonly pi: PiApi; readonly handlers: readonly RegisteredHandler[] } {
	const handlers: RegisteredHandler[] = [];
	const pi: PiApi = {
		on(eventName, handler) {
			handlers.push({ eventName, handler });
		},
	};
	return { pi, handlers };
}

function makeContext(): PiContext {
	return { cwd: join(import.meta.dir, ".tmp", crypto.randomUUID()) };
}

describe("claudeHooksCompat extension", () => {
	it("registers Pi pre-tool and post-tool handlers", () => {
		const harness = makeHarness();
		claudeHooksCompat(harness.pi);

		expect(harness.handlers.map((entry) => entry.eventName)).toEqual(["tool_call", "tool_result"]);
	});

	it("blocks protected writes through the Pi tool_call handler and emits a trace", async () => {
		const harness = makeHarness();
		claudeHooksCompat(harness.pi);
		const toolCall = harness.handlers.find((entry) => entry.eventName === "tool_call");
		expect(toolCall).toBeDefined();
		if (!toolCall) throw new Error("tool_call handler missing");

		const ctx = makeContext();
		const result = await toolCall.handler(
			{ toolName: "write", input: { file_path: "specs/archive/example/proposal.md" } },
			ctx,
		);

		expect(result).toMatchObject({ block: true });
		const tracePath = join(ctx.cwd, ".claude", "traces", "pi.jsonl");
		expect(existsSync(tracePath)).toBe(true);
		expect(readFileSync(tracePath, "utf-8")).toContain("ToolBlocked");
	});

	it("surfaces post-write warnings through Pi UI notifications", async () => {
		const harness = makeHarness();
		claudeHooksCompat(harness.pi);
		const toolResult = harness.handlers.find((entry) => entry.eventName === "tool_result");
		expect(toolResult).toBeDefined();
		if (!toolResult) throw new Error("tool_result handler missing");

		const notifications: string[] = [];
		const ctx: PiContext = {
			cwd: join(import.meta.dir, ".tmp", crypto.randomUUID()),
			ui: { notify: (message) => notifications.push(message) },
		};

		await toolResult.handler(
			{
				toolName: "write",
				input: { file_path: join(ctx.cwd, "apps", "backend", "src", "feature.ts") },
			},
			ctx,
		);

		expect(notifications).toEqual([
			`Note: ${join(ctx.cwd, "apps", "backend", "src", "feature.ts")} has no colocated test file`,
		]);
	});
});
