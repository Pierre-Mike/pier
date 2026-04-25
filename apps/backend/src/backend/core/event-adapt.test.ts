import { expect, test } from "bun:test";
import { AGENT_TOOL_NAMES, adapt } from "./event-adapt.ts";

const ctx = { project: "test-proj", session: "sess-123" };

test("adapt returns null for malformed input", () => {
	expect(adapt(null, ctx)).toBeNull();
	expect(adapt(undefined, ctx)).toBeNull();
	expect(adapt(42, ctx)).toBeNull();
	expect(adapt("string", ctx)).toBeNull();
	expect(adapt({}, ctx)).toBeNull();
	expect(adapt({ cwd: "/tmp" }, ctx)).toBeNull();
});

test("adapt creates base event with project and session from ctx", () => {
	const raw = { type: "api_request", timestamp: "2025-01-15T10:00:00.000Z" };
	const evt = adapt(raw, ctx);
	expect(evt).not.toBeNull();
	expect(evt?.project).toBe("test-proj");
	expect(evt?.run).toBe("sess-123");
	expect(evt?.kind).toBe("claude:api_request");
	expect(evt?.ts).toBe(Date.parse("2025-01-15T10:00:00.000Z"));
});

test("adapt uses Date.now() when timestamp invalid", () => {
	const raw = { type: "api_request", timestamp: "invalid" };
	const before = Date.now();
	const evt = adapt(raw, ctx);
	const after = Date.now();
	expect(evt?.ts).toBeGreaterThanOrEqual(before);
	expect(evt?.ts).toBeLessThanOrEqual(after);
});

test("adapt includes uuid and role when present", () => {
	const raw = {
		type: "api_request",
		uuid: "abc-123",
		sessionId: "file.jsonl",
		message: { role: "assistant" },
	};
	const evt = adapt(raw, ctx);
	expect(evt?.["uuid"]).toBe("abc-123");
	expect(evt?.["role"]).toBe("assistant");
	expect(evt?.source).toBe("file.jsonl");
});

test("adapt handles string content", () => {
	const raw = {
		type: "api_request",
		message: { content: "Hello world" },
	};
	const evt = adapt(raw, ctx);
	expect(evt?.["text"]).toBe("Hello world");
});

test("adapt ignores empty string content", () => {
	const raw = {
		type: "api_request",
		message: { content: "   " },
	};
	const evt = adapt(raw, ctx);
	expect(evt?.["text"]).toBeUndefined();
});

test("adapt categorizes tool_use as tool when name not in AGENT_TOOL_NAMES", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [
				{
					type: "tool_use",
					id: "tool-1",
					name: "Read",
					input: { path: "/tmp/foo" },
				},
			],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.kind).toBe("claude:tool_use");
	expect(evt?.category).toBe("tool");
	expect(evt?.["tool"]).toBe("Read");
	expect(evt?.["tool_id"]).toBe("tool-1");
	expect(evt?.["input"]).toEqual({ path: "/tmp/foo" });
});

test("adapt categorizes tool_use as agent when name in AGENT_TOOL_NAMES", () => {
	for (const name of AGENT_TOOL_NAMES) {
		const raw = {
			type: "api_request",
			message: {
				content: [
					{
						type: "tool_use",
						id: "agent-1",
						name,
						input: {},
					},
				],
			},
		};
		const evt = adapt(raw, ctx);
		expect(evt?.kind).toBe("claude:agent_use");
		expect(evt?.category).toBe("agent");
		expect(evt?.["tool"]).toBe(name);
	}
});

test("adapt categorizes tool_result as tool when is_error is false", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: "tool-1",
					is_error: false,
					content: "Success",
				},
			],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.kind).toBe("claude:tool_result");
	expect(evt?.category).toBe("tool");
	expect(evt?.["status"]).toBe("ok");
	expect(evt?.["ok"]).toBe(true);
	expect(evt?.["tool_id"]).toBe("tool-1");
	expect(evt?.["text"]).toBe("Success");
});

test("adapt categorizes tool_result as error when is_error is true", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: "tool-2",
					is_error: true,
					content: "Failed",
				},
			],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.kind).toBe("claude:tool_result");
	expect(evt?.category).toBe("error");
	expect(evt?.["status"]).toBe("error");
	expect(evt?.["ok"]).toBe(false);
});

test("adapt extracts text from tool_result content array", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: "tool-3",
					content: [
						{ type: "text", text: "Line 1" },
						{ type: "text", text: "Line 2" },
					],
				},
			],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.["text"]).toBe("Line 1\nLine 2");
});

test("adapt handles text block with category=text", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [{ type: "text", text: "Some output" }],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.kind).toBe("claude:text");
	expect(evt?.category).toBe("text");
	expect(evt?.["text"]).toBe("Some output");
});

test("adapt skips text block with empty text", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [{ type: "text", text: "  " }],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.category).toBeUndefined();
});

test("adapt handles thinking block with category=thinking", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [{ type: "thinking", thinking: "Pondering..." }],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.kind).toBe("claude:thinking");
	expect(evt?.category).toBe("thinking");
	expect(evt?.["text"]).toBe("Pondering...");
});

test("adapt returns first block when multiple blocks present", () => {
	const raw = {
		type: "api_request",
		message: {
			content: [
				{ type: "text", text: "First" },
				{ type: "text", text: "Second" },
			],
		},
	};
	const evt = adapt(raw, ctx);
	expect(evt?.["text"]).toBe("First");
});
