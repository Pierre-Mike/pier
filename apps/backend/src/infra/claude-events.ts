import { type FSWatcher, mkdirSync, watch } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { adapt, type PiEvent } from "../core/event-adapt.ts";
import { ConfigService } from "../platform/config.repo.ts";
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

const tryParse = (line: string): ClaudeEntry | null => {
	try {
		return JSON.parse(line) as ClaudeEntry;
	} catch {
		return null;
	}
};

const entryToEvent = (entry: ClaudeEntry): PiEvent | null => {
	if (!entry.cwd) return null;
	const project = basename(entry.cwd);
	const session = entry.sessionId ?? "unknown";
	return adapt(entry, { project, session });
};

const processLine = (
	line: string,
	emit: (evt: PiEvent) => Effect.Effect<void, never, never>,
): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const trimmed = line.trim();
		if (!trimmed) return;
		const parsed = tryParse(trimmed);
		if (!parsed) return;
		const evt = entryToEvent(parsed);
		if (evt) yield* emit(evt);
	});

const readAppendedImpl = (opts: {
	path: string;
	offsetRef: { v: number };
	emit: (evt: PiEvent) => Effect.Effect<void, never, never>;
}): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { path, offsetRef, emit } = opts;
		const s = yield* Effect.tryPromise(() => stat(path)).pipe(Effect.orElseSucceed(() => null));
		if (!s) return;
		if (s.size < offsetRef.v) offsetRef.v = 0;
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
		const lines = buf.toString("utf8").split("\n");
		for (const line of lines) {
			yield* processLine(line, emit);
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

const splitLines = (buf: string): string[] => {
	const lines: string[] = [];
	let start = 0;
	const len = buf.length;
	for (let i = 0; i <= len; i++) {
		if (i === len || buf.charCodeAt(i) === 10) {
			if (i > start) lines.push(buf.slice(start, i));
			start = i + 1;
		}
	}
	return lines;
};

const collectFromHistoryFile = (opts: {
	dir: string;
	file: string;
	project: string | undefined;
	out: PiEvent[];
}): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { dir, file, project, out } = opts;
		const buf = yield* Effect.tryPromise(() => readFile(join(dir, file), "utf8")).pipe(
			Effect.orElseSucceed(() => ""),
		);
		for (const line of splitLines(buf)) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const parsed = tryParse(trimmed);
			if (!parsed?.cwd) continue;
			if (project && basename(parsed.cwd) !== project) continue;
			const evt = entryToEvent(parsed);
			if (evt) out.push(evt);
		}
	});

const collectFromHistoryDir = (opts: {
	root: string;
	dirEntry: string;
	project: string | undefined;
	session: string | undefined;
	out: PiEvent[];
}): Effect.Effect<void, never, never> =>
	Effect.gen(function* () {
		const { root, dirEntry, project, session, out } = opts;
		if (!dirEntry.startsWith("-")) return;
		const dir = join(root, dirEntry);
		let files = yield* Effect.tryPromise(async () => {
			const all = await readdir(dir);
			return all.filter((f) => f.endsWith(".jsonl"));
		}).pipe(Effect.orElseSucceed(() => [] as string[]));
		if (session) files = files.filter((f) => f.startsWith(session));
		for (const f of files) {
			yield* collectFromHistoryFile({ dir, file: f, project, out });
		}
	});

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
					for (const e of entries) attach(e);
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
					Effect.gen(function* () {
						const limit = Math.max(1, Math.min(q.limit, 20000));
						const out: PiEvent[] = [];
						const dirs = yield* Effect.tryPromise(() => readdir(claudeProjectsRoot)).pipe(
							Effect.orElseSucceed(() => [] as string[]),
						);
						for (const d of dirs) {
							yield* collectFromHistoryDir({
								root: claudeProjectsRoot,
								dirEntry: d,
								project: q.project,
								session: q.session,
								out,
							});
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
