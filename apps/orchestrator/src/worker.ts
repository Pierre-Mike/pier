import { Effect } from "effect";
import type { Engine, IssueRef, SessionId, WorkerId } from "./state.ts";

export interface WorkerSpawnRequest {
	readonly issue: IssueRef;
	readonly engine: Engine;
	readonly worker_id: WorkerId;
	readonly worktree_path: string;
	readonly prompt: string;
}

export interface WorkerHandle {
	readonly pid: number;
	readonly session_id: SessionId;
	readonly worker_id: WorkerId;
	readonly kill: () => Effect.Effect<void>;
	readonly wait: () => Effect.Effect<WorkerExit>;
}

export type WorkerExit =
	| { readonly _tag: "Normal"; readonly code: 0 }
	| { readonly _tag: "Abnormal"; readonly code: number; readonly signal: NodeJS.Signals | null }
	| { readonly _tag: "Stalled" };

export class SpawnError extends Error {
	readonly _tag = "SpawnError";
	constructor(
		readonly engine: Engine,
		readonly reason: string,
	) {
		super(`spawn ${engine} failed: ${reason}`);
	}
}

const SESSION_INIT_TIMEOUT_MS = 15_000;

const build_args = (engine: Engine): ReadonlyArray<string> => {
	switch (engine) {
		case "claude":
			return ["claude", "-p", "--output-format", "stream-json", "--verbose"];
		case "kata":
			return ["kata", "run", "--stream"];
		case "openai":
			return ["openai-agents", "run", "--stream"];
	}
};

async function* line_iter(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	let buf = "";
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				if (buf.length > 0) yield buf;
				return;
			}
			buf += decoder.decode(value, { stream: true });
			let nl = buf.indexOf("\n");
			while (nl !== -1) {
				yield buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				nl = buf.indexOf("\n");
			}
		}
	} finally {
		reader.releaseLock();
	}
}

interface StreamEvent {
	readonly type?: string;
	readonly subtype?: string;
	readonly session_id?: string;
}

const extract_session_id = async (
	stream: ReadableStream<Uint8Array>,
	timeout_ms: number,
): Promise<{ session_id: string; rest: AsyncGenerator<string> }> => {
	const iter = line_iter(stream);
	const deadline = Date.now() + timeout_ms;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const next = (await Promise.race([
			iter.next(),
			new Promise<{ done: true; value: undefined }>((r) =>
				setTimeout(() => r({ done: true, value: undefined }), remaining),
			),
		])) as IteratorResult<string, undefined>;
		if (next.done) break;
		const line = next.value.trim();
		if (!line) continue;
		try {
			const evt = JSON.parse(line) as StreamEvent;
			if (typeof evt.session_id === "string" && evt.session_id.length > 0) {
				return { session_id: evt.session_id, rest: iter };
			}
		} catch {
			// non-JSON line, skip
		}
	}
	throw new Error("session_id init timeout");
};

const drain = (gen: AsyncGenerator<string>) => {
	void (async () => {
		try {
			for await (const _ of gen) {
				// future: stall watchdog, token tally, phase transitions
			}
		} catch {
			// drop
		}
	})();
};

const drain_stream = (stream: ReadableStream<Uint8Array> | undefined) => {
	if (!stream) return;
	void (async () => {
		const reader = stream.getReader();
		try {
			while (true) {
				const { done } = await reader.read();
				if (done) break;
			}
		} catch {
			// drop
		} finally {
			reader.releaseLock();
		}
	})();
};

export const spawn_worker = (req: WorkerSpawnRequest): Effect.Effect<WorkerHandle, SpawnError> =>
	Effect.gen(function* () {
		const args = build_args(req.engine);
		const proc = yield* Effect.try({
			try: () =>
				Bun.spawn(args as string[], {
					cwd: req.worktree_path,
					env: {
						...process.env,
						PIER_WORKER_ID: req.worker_id,
						PIER_ISSUE_ID: req.issue.id,
					},
					stdout: "pipe",
					stderr: "pipe",
					stdin: "pipe",
				}),
			catch: (e) => new SpawnError(req.engine, String(e)),
		});

		yield* Effect.try({
			try: () => {
				const writer = proc.stdin;
				if (writer && typeof writer === "object" && "write" in writer) {
					writer.write(req.prompt);
					writer.end();
				}
			},
			catch: (e) => new SpawnError(req.engine, `stdin write: ${e}`),
		});

		const init = yield* Effect.tryPromise({
			try: () => extract_session_id(proc.stdout, SESSION_INIT_TIMEOUT_MS),
			catch: (e) => {
				try {
					proc.kill();
				} catch {
					// already dead
				}
				return new SpawnError(req.engine, `session init: ${e}`);
			},
		});

		drain(init.rest);
		drain_stream(proc.stderr);

		const session_id: SessionId = `${init.session_id}-0`;

		return {
			pid: proc.pid,
			session_id,
			worker_id: req.worker_id,
			kill: () =>
				Effect.sync(() => {
					proc.kill();
				}),
			wait: () =>
				Effect.tryPromise({
					try: async (): Promise<WorkerExit> => {
						const code = await proc.exited;
						if (code === 0) return { _tag: "Normal", code: 0 };
						return { _tag: "Abnormal", code: code ?? -1, signal: null };
					},
					catch: (): WorkerExit => ({ _tag: "Abnormal", code: -1, signal: null }),
				}).pipe(
					Effect.catchAll(
						(exit) => Effect.succeed(exit as WorkerExit) as Effect.Effect<WorkerExit>,
					),
				),
		} satisfies WorkerHandle;
	});
