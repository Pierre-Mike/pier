/**
 * Gate: slice 1 — bridge-lifecycle structured logs
 *
 * Asserts that handleZellijWsUpgrade and zellijWsHandlers emit structured
 * log events at the three observable lifecycle points:
 *   1. WS upgrade  → {kind, sessionId, activeBridges}
 *   2. WS open     → {kind, sessionId, upstreamReadyState}
 *   3. WS close    → {kind, sessionId, reason}
 *
 * "Structured" means each emitted value is a plain object with named fields,
 * NOT a free-form string (console.log). Tests intercept the log channel
 * (bridgeLog) exported from the module and assert the event shape.
 *
 * RED: the module does not yet export bridgeLog nor emit these events.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import {
	type BridgeLogEvent,
	bridgeLog,
	handleZellijWsUpgrade,
	type ZellijWsBridge,
	zellijWsHandlers,
} from "./zellij-ws-proxy.ts";

// ---------------------------------------------------------------------------
// Minimal stubs — do NOT import real zellij-auth to avoid network I/O
// ---------------------------------------------------------------------------

const noop = (): void => void 0;

const makeFakeUpstream = (readyState: number = WebSocket.OPEN): WebSocket =>
	({
		readyState,
		binaryType: "arraybuffer",
		send: noop,
		close: noop,
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
	}) as unknown as WebSocket;

const makeFakeWs = (overrides: Partial<ZellijWsBridge> = {}): ServerWebSocket<ZellijWsBridge> =>
	({
		data: {
			cookie: "test-cookie",
			targetUrl: "ws://localhost:9999/",
			upstream: null,
			upBuffer: [],
			sessionId: "proj-abc",
			...overrides,
		},
		send: () => 0,
		close: noop,
		subscribe: noop,
		unsubscribe: noop,
		publish: () => 0,
		isSubscribed: () => false,
		cork: (fn: () => void) => fn(),
		remoteAddress: "127.0.0.1",
		readyState: WebSocket.OPEN,
		binaryType: "arraybuffer",
	}) as unknown as ServerWebSocket<ZellijWsBridge>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const collected: BridgeLogEvent[] = [];

beforeEach(() => {
	collected.length = 0;
	bridgeLog.subscribe((evt) => collected.push(evt));
});

// ---------------------------------------------------------------------------
// Shape contract for BridgeLogEvent
// ---------------------------------------------------------------------------

describe("BridgeLogEvent shape", () => {
	it("upgrade event carries sessionId and activeBridges", () => {
		// Trigger the upgrade handler with a fake already-upgraded server so we
		// can observe the log without network I/O. The module must call
		// server.upgrade() and emit the log even when the upstream cookie fetch
		// is mocked.
		const evt = collected.find((e) => e.kind === "bridge:upgrade");
		// No event has been emitted yet — this will be populated by the
		// implementer. This test is a shape assertion, so it verifies the
		// TypeScript type is correct; the runtime test is below.
		const _typeCheck: BridgeLogEvent = {
			kind: "bridge:upgrade",
			sessionId: "s",
			activeBridges: 0,
		};
		expect(_typeCheck.kind).toBe("bridge:upgrade");
		expect(typeof _typeCheck.sessionId).toBe("string");
		expect(typeof _typeCheck.activeBridges).toBe("number");
		// The produced event (from actual handler invocation) is tested below.
		void evt; // used only for type narrowing above
	});

	it("open event carries sessionId and upstreamReadyState", () => {
		const _typeCheck: BridgeLogEvent = {
			kind: "bridge:open",
			sessionId: "s",
			upstreamReadyState: WebSocket.CONNECTING,
		};
		expect(_typeCheck.kind).toBe("bridge:open");
		expect(typeof _typeCheck.sessionId).toBe("string");
		expect(typeof _typeCheck.upstreamReadyState).toBe("number");
	});

	it("close event carries sessionId and reason", () => {
		const _typeCheck: BridgeLogEvent = {
			kind: "bridge:close",
			sessionId: "s",
			reason: "downstream closed",
		};
		expect(_typeCheck.kind).toBe("bridge:close");
		expect(typeof _typeCheck.sessionId).toBe("string");
		expect(typeof _typeCheck.reason).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// Runtime: zellijWsHandlers emits on open
// ---------------------------------------------------------------------------

describe("zellijWsHandlers.open", () => {
	it("emits bridge:open with sessionId and upstreamReadyState", () => {
		const ws = makeFakeWs();
		// Patch WebSocket constructor so the handler does not make real network calls
		const OrigWS = globalThis.WebSocket;
		(globalThis as unknown as Record<string, unknown>)["WebSocket"] = function FakeWS() {
			return makeFakeUpstream(WebSocket.CONNECTING);
		};
		try {
			zellijWsHandlers.open(ws);
		} finally {
			globalThis.WebSocket = OrigWS;
		}

		const evt = collected.find((e) => e.kind === "bridge:open");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:open") throw new Error("no bridge:open event");
		expect(evt.sessionId).toBe("proj-abc");
		expect(typeof evt.upstreamReadyState).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// Runtime: zellijWsHandlers emits on close
// ---------------------------------------------------------------------------

describe("zellijWsHandlers.close", () => {
	it("emits bridge:close with sessionId and reason", () => {
		const upstream = makeFakeUpstream(WebSocket.OPEN);
		const ws = makeFakeWs({ upstream });
		zellijWsHandlers.close(ws);

		const evt = collected.find((e) => e.kind === "bridge:close");
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:close") throw new Error("no bridge:close event");
		expect(evt.sessionId).toBe("proj-abc");
		expect(typeof evt.reason).toBe("string");
		expect(evt.reason.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Runtime: handleZellijWsUpgrade emits on upgrade attempt
// ---------------------------------------------------------------------------

describe("handleZellijWsUpgrade", () => {
	it("emits bridge:upgrade with sessionId and activeBridges before returning", async () => {
		const fakeServer = {
			upgrade: (_req: Request, _opts: unknown) => true,
		} as unknown as Server<ZellijWsBridge>;

		// Patch getZellijCookie to avoid real network I/O
		// The module must emit the log regardless of whether the cookie fetch
		// succeeds or fails — so we test the case where upgrade succeeds.
		const req = new Request("http://localhost/zellij/ws?session=proj-abc", {
			headers: { Upgrade: "websocket", Connection: "Upgrade" },
		});

		// The upgrade handler calls getZellijCookie internally.
		// Patching it via module-level mock is not possible without ESM mocking.
		// Instead, assert that IF an upgrade:bridge event was emitted, it has the
		// right shape. The test is RED because bridgeLog does not exist yet.
		// When the implementation is present, the event will be emitted.
		await handleZellijWsUpgrade({
			req,
			server: fakeServer,
			zellijUrl: "http://localhost:9999",
		}).catch(() => {
			// network errors are expected in test environment — we only care
			// about whether the log event was emitted before/after the attempt
		});

		const evt = collected.find((e) => e.kind === "bridge:upgrade");
		// After implementation: this must be defined. Until then, it is undefined
		// (RED). Asserting it is defined makes the test fail in RED state.
		expect(evt).toBeDefined();
		if (!evt || evt.kind !== "bridge:upgrade") throw new Error("no bridge:upgrade event");
		expect(typeof evt.sessionId).toBe("string");
		expect(typeof evt.activeBridges).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// Machine-parseable contract: events must be plain objects, not strings
// ---------------------------------------------------------------------------

describe("events are machine-parseable objects", () => {
	it("all collected events round-trip through JSON.stringify / JSON.parse", () => {
		const upstream = makeFakeUpstream(WebSocket.OPEN);
		const ws = makeFakeWs({ upstream });
		zellijWsHandlers.close(ws);

		for (const evt of collected) {
			expect(typeof evt).toBe("object");
			expect(evt).not.toBeNull();
			const serialised = JSON.stringify(evt);
			expect(typeof serialised).toBe("string");
			const parsed = JSON.parse(serialised) as BridgeLogEvent;
			expect(parsed.kind).toBe(evt.kind);
		}
	});
});
