import { type FSWatcher, mkdirSync, watch } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { adapt, type PiEvent } from "../core/event-adapt.ts";
import { ConfigService } from "./config.ts";
import { EventBus, type EventBusService } from "./sse-bus.ts";

type ClaudeEntry = {
	type?: string;
	timestamp?: string;
	cwd?: string;
	sessionId?: string;
	uuid?: string;
	message?: { role?: string; content?: unknown };
};

export interface ClaudeEventStream {
	readonly start: () => Effect.Effect<void, never, never>;
	readonly readHistory: (q: {
		project?: string;
		session?: string;
		limit: number;
	}) => Effect.Effect<PiEvent[], never>;
}

export const ClaudeEventStream = Context.GenericTag<ClaudeEventStream>("ClaudeEventStream");

const readAppendedImpl = (opts: {
	path: string;
	offsetRef: { v: number };
	emit: (evt: PiEvent) => Effect.Effect<void, never, never>;
}): Effect.Effect<void, never, never> =>
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Effect generators require sequential logic
	Effect.gen(function* () {
		const { path, offsetRef, emit } = opts;
		const s = yield* Effect.tryPromise(() => stat(path)).pipe(Effect.orElseSucceed(() => null));
		if (!s) return;
		if (s.size < offsetRef.v) {
			offsetRef.v = 0;
		}
		if (s.size === offsetRef.v) return;
		const fh = yield* Effect.tryPromise(() => open(path, "r")).pipe(
			Effect.orElseSucceed(() => null),
		);
		if (!fh) return;
		const len = s.size - offsetRef.v;
		const buf = Buffer.alloc(len);
		yield* Effect.tryPromise(async () => {
			await fh.read(buf, 0, len, offsetRef.v);
			await fh.close();
		}).pipe(Effect.orElseSucceed(() => undefined));
		offsetRef.v = s.size;
		let tail = buf.toString("utf8");
		let nl = tail.indexOf("\n");
		while (nl !== -1) {
			const line = tail.slice(0, nl).trim();
			tail = tail.slice(nl + 1);
			if (line) {
				const parsed = yield* Effect.sync(() => {
					try {
						return JSON.parse(line) as ClaudeEntry;
					} catch {
						return null;
					}
				});
				if (parsed?.cwd) {
					const project = basename(parsed.cwd);
					const session = parsed.sessionId ?? "unknown";
					const evt = adapt(parsed, { project, session });
					if (evt) {
						yield* emit(evt);
					}
				}
			}
			nl = tail.indexOf("\n");
		}
	});

const watchProjectDir = (
	dir: string,
	emit: (evt: PiEvent) => Effect.Effect<void, never, never>,
): (() => void) => {
	const offsets = new Map<string, { v: number }>();
	let watcher: FSWatcher | null = null;
	let closed = false;

	const ensureOffset = (name: string): Effect.Effect<{ v: number } | null, never, never> =>
		Effect.gen(function* () {
			const ref = offsets.get(name);
			if (ref) return ref;
			const newRef = { v: 0 };
			const s = yield* Effect.tryPromise(() => stat(join(dir, name))).pipe(
				Effect.orElseSucceed(() => null),
			);
			if (!s) return null;
			newRef.v = s.size;
			offsets.set(name, newRef);
			return newRef;
		});

	const onChange = (name: string): void => {
		if (!name.endsWith(".jsonl")) return;
		const first = !offsets.has(name);
		Effect.runPromise(
			Effect.gen(function* () {
				const ref = yield* ensureOffset(name);
				if (!ref || first) return;
				yield* readAppendedImpl({ path: join(dir, name), offsetRef: ref, emit });
			}),
		).catch(() => {
			/* ignore */
		});
	};

	const init = (): void => {
		Effect.runPromise(
			Effect.gen(function* () {
				const entries = yield* Effect.tryPromise(() => readdir(dir)).pipe(
					Effect.orElseSucceed(() => [] as string[]),
				);
				for (const e of entries) {
					if (!e.endsWith(".jsonl")) continue;
					yield* ensureOffset(e);
				}
			}),
		)
			.then(() => {
				if (closed) return;
				watcher = watch(dir, (_type, filename) => {
					if (!filename || closed) return;
					const name = typeof filename === "string" ? filename : String(filename);
					onChange(name);
				});
			})
			.catch(() => {
				/* ignore */
			});
	};

	init();

	return () => {
		closed = true;
		watcher?.close();
	};
};

export const makeClaudeEventStreamLive = (): Layer.Layer<
	ClaudeEventStream,
	never,
	ConfigService | EventBusService
> =>
	Layer.effect(
		ClaudeEventStream,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const bus = yield* EventBus;
			const config = yield* cfg.get();
			const claudeProjectsRoot = config.claudeProjectsRoot;
			const dirStops = new Map<string, () => void>();
			let started = false;

			const attach = (encoded: string): void => {
				if (!encoded.startsWith("-")) return;
				const full = join(claudeProjectsRoot, encoded);
				if (dirStops.has(full)) return;
				dirStops.set(
					full,
					watchProjectDir(full, (evt) => bus.emit(evt)),
				);
			};

			const scan = (): Effect.Effect<void, never, never> =>
				Effect.gen(function* () {
					const entries = yield* Effect.tryPromise(() => readdir(claudeProjectsRoot)).pipe(
						Effect.orElseSucceed(() => [] as string[]),
					);
					for (const e of entries) {
						attach(e);
					}
				});

			return {
				start: () =>
					Effect.gen(function* () {
						if (started) return;
						started = true;
						yield* Effect.tryPromise(() =>
							Promise.resolve(mkdirSync(claudeProjectsRoot, { recursive: true })),
						).pipe(Effect.orElseSucceed(() => undefined));
						yield* scan();
						watch(claudeProjectsRoot, (_type, filename) => {
							if (!filename) return;
							attach(typeof filename === "string" ? filename : String(filename));
						});
					}),
				readHistory: (q) =>
					// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Effect generators require sequential logic
					Effect.gen(function* () {
						const limit = Math.max(1, Math.min(q.limit, 20000));
						const out: PiEvent[] = [];
						const dirs = yield* Effect.tryPromise(() => readdir(claudeProjectsRoot)).pipe(
							Effect.orElseSucceed(() => [] as string[]),
						);
						for (const d of dirs) {
							if (!d.startsWith("-")) continue;
							const dir = join(claudeProjectsRoot, d);
							let files = yield* Effect.tryPromise(async () => {
								const all = await readdir(dir);
								return all.filter((f) => f.endsWith(".jsonl"));
							}).pipe(Effect.orElseSucceed(() => [] as string[]));
							if (q.session) {
								files = files.filter((f) => f.startsWith(q.session ?? ""));
							}
							for (const f of files) {
								const buf = yield* Effect.tryPromise(() => readFile(join(dir, f), "utf8")).pipe(
									Effect.orElseSucceed(() => ""),
								);
								let start = 0;
								const len = buf.length;
								for (let i = 0; i <= len; i++) {
									if (i === len || buf.charCodeAt(i) === 10) {
										if (i > start) {
											const line = buf.slice(start, i).trim();
											if (line) {
												const parsed = yield* Effect.sync(() => {
													try {
														return JSON.parse(line) as ClaudeEntry;
													} catch {
														return null;
													}
												});
												if (parsed?.cwd) {
													const project = basename(parsed.cwd);
													if (q.project && project !== q.project) {
														start = i + 1;
														continue;
													}
													const session = parsed.sessionId ?? "unknown";
													const evt = adapt(parsed, { project, session });
													if (evt) {
														out.push(evt);
													}
												}
											}
										}
										start = i + 1;
									}
								}
							}
						}
						out.sort((a, b) => a.ts - b.ts);
						return out.length > limit ? out.slice(out.length - limit) : out;
					}),
			};
		}),
	);

export const ClaudeEventStreamTest: Layer.Layer<ClaudeEventStream> = Layer.succeed(
	ClaudeEventStream,
	{
		start: () => Effect.void,
		readHistory: () => Effect.succeed([]),
	},
);
