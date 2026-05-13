/**
 * Tests for agent-view.ts dashboard module.
 *
 * Covers AC6 (three section headings) and AC7 (Attach button per row)
 * from spec 056 proposal.md via both DOM rendering and source inspection.
 *
 * spec 060 additions (AC1–AC6):
 * - AC3: AgentRow interface includes sessionId field
 * - AC4: attachAgent uses claude --resume <sessionId> (not claude attach)
 * - AC5: pier:zellij-launch detail includes cwd field
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";

// ---------------------------------------------------------------------------
// DOM environment setup (happy-dom)
// ---------------------------------------------------------------------------

const win = new GlobalWindow();
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).window = win;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).document = win.document;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).HTMLElement = win.HTMLElement;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Element = win.Element;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Node = win.Node;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).Event = win.Event;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).CustomEvent = win.CustomEvent;
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).EventSource = class MockEventSource {
	addEventListener(_type: unknown, _handler: unknown): void {
		void 0;
	}
	set onerror(_h: unknown) {
		void 0;
	}
	close(): void {
		void 0;
	}
};
// biome-ignore lint/suspicious/noExplicitAny: test-only global injection
(globalThis as any).fetch = async () =>
	new Response(JSON.stringify({ shortId: "abcd1234" }), { status: 200 });

// ---------------------------------------------------------------------------
// Source inspection (structural)
// ---------------------------------------------------------------------------

const agentViewSource = await Bun.file(new URL("./agent-view.ts", import.meta.url)).text();

describe("agent-view.ts source structure", () => {
	test("defines three group labels: Needs input, Working, Completed", () => {
		expect(agentViewSource).toContain("Needs input");
		expect(agentViewSource).toContain("Working");
		expect(agentViewSource).toContain("Completed");
	});

	test("renders data-group-heading attributes for each group", () => {
		expect(agentViewSource).toContain("data-group-heading");
	});

	test("renders data-agent-row attributes per row", () => {
		expect(agentViewSource).toContain("data-agent-row");
	});

	test("renders data-attach-button per row", () => {
		expect(agentViewSource).toContain("data-attach-button");
	});

	test("uses pier:zellij-launch custom event for attach", () => {
		expect(agentViewSource).toContain("pier:zellij-launch");
	});

	// spec 060 AC4: attach must use claude --resume, NOT claude attach
	test("uses claude --resume command string for attach (AC4)", () => {
		expect(agentViewSource).toContain("claude --resume");
	});

	test("does NOT use deprecated claude attach command string (AC4)", () => {
		// RED: agent-view.ts currently has `claude attach ${shortId}` — this must be removed
		expect(agentViewSource).not.toContain("claude attach");
	});

	// spec 060 AC5: pier:zellij-launch detail must include cwd field
	test("pier:zellij-launch event detail includes cwd field (AC5)", () => {
		// RED: agent-view.ts currently does not pass cwd in the zellij-launch detail
		expect(agentViewSource).toMatch(/pier:zellij-launch[\s\S]*detail[\s\S]*cwd/);
	});

	// spec 060 AC3: AgentRow interface must include sessionId
	test("AgentRow interface includes sessionId field (AC3)", () => {
		// RED: agent-view.ts currently does not have sessionId in AgentRow
		expect(agentViewSource).toContain("sessionId");
	});

	test("exports mountAgentView function", () => {
		expect(agentViewSource).toContain("export function mountAgentView");
	});

	test("exports dispatchAgent function", () => {
		expect(agentViewSource).toContain("export async function dispatchAgent");
	});

	test("connects to /api/agents/stream SSE endpoint", () => {
		expect(agentViewSource).toContain("/api/agents/stream");
	});
});

// ---------------------------------------------------------------------------
// DOM rendering tests (AC6 + AC7)
// ---------------------------------------------------------------------------

describe("mountAgentView DOM rendering", () => {
	let container: HTMLElement;

	beforeEach(async () => {
		container = win.document.createElement("div") as unknown as HTMLElement;
		win.document.body.appendChild(container as unknown as Node);
	});

	afterEach(() => {
		// Clear the container between tests
		container.innerHTML = "";
		if (container.parentNode) {
			container.parentNode.removeChild(container as unknown as ChildNode);
		}
	});

	test("AC6: panel renders three section headings after mount", async () => {
		const { mountAgentView, unmountAgentView } = await import("./agent-view.ts");
		mountAgentView(container as unknown as HTMLElement);

		const headings = container.querySelectorAll("[data-group-heading]");
		expect(headings.length).toBe(3);

		const labels = Array.from(headings).map((h) => h.textContent?.trim());
		expect(labels).toContain("Needs input");
		expect(labels).toContain("Working");
		expect(labels).toContain("Completed");

		unmountAgentView();
	});

	test("AC6: panel has .agent-view class", async () => {
		const { mountAgentView, unmountAgentView } = await import("./agent-view.ts");
		mountAgentView(container as unknown as HTMLElement);

		expect(container.classList.contains("agent-view")).toBe(true);

		unmountAgentView();
	});
});
