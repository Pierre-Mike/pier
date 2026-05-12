import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

// Zellij names a unix socket `<socket_dir>/<version>/<name>`. macOS sun_path is
// 104 bytes; default `$TMPDIR/zellij-<uid>` on macOS is ~62 chars, leaving too
// little for the name. Pin to a short, stable dir so the budget is predictable.
// `/var/z` is preferred over `/tmp/z` because /tmp is wiped on reboot/cleanup
// (see zellij-org/zellij#5081), which would orphan running sessions.
// Users who want their interactive `zellij` to share these sessions should
// `export ZELLIJ_SOCKET_DIR=/var/z` in their shell rc.
export const ZELLIJ_SOCKET_DIR = "/var/z";
const MAX_ZELLIJ_NAME = 60;

const sessionIdFromProjectId = (projectId: string): string =>
	projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, MAX_ZELLIJ_NAME);

export type SessionId = string;

export type Session = {
	id: SessionId;
	projectId: string;
	url: string;
	createdAt: number;
	status: "live" | "dead";
};

export class TerminalError extends Data.TaggedError("TerminalError")<{ message: string }> {}
export class TerminalNotFound extends Data.TaggedError("TerminalNotFound")<{ id: string }> {}

export interface TerminalSessions {
	readonly open: (projectId: string) => Effect.Effect<Session, TerminalError, never>;
	readonly openDefault: () => Effect.Effect<Session, TerminalError, never>;
	readonly close: (id: SessionId) => Effect.Effect<void, TerminalNotFound, never>;
	readonly list: () => Effect.Effect<Session[], never, never>;
	readonly get: (id: SessionId) => Effect.Effect<Session | null, never, never>;
	readonly health: (id: SessionId) => Effect.Effect<boolean, never, never>;
	readonly writeChars: (args: {
		projectId: string;
		text: string;
	}) => Effect.Effect<{ injected: boolean }, never, never>;
}

export const TerminalSessions = Context.GenericTag<TerminalSessions>("TerminalSessions");

// Truth source for "does a zellij --server exist for this name?" is the unix
// socket under ZELLIJ_SOCKET_DIR/contract_version_1/. We CANNOT shell out to
// `zellij list-sessions`: Bun.spawn invokes it without a TTY and the process
// blocks for ~25s instead of exiting, freezing every code path that calls it.
const zellijSocketDir = (): string => join(ZELLIJ_SOCKET_DIR, "contract_version_1");

const zellijSessionExists = async (id: string): Promise<boolean> => {
	try {
		const entries = await readdir(zellijSocketDir());
		return entries.includes(id);
	} catch {
		return false;
	}
};

// Spawn `zellij --session <id>` in a real PTY at `cwd`, wait for the server to
// register the session (socket appears on disk), then kill the client. The
// server keeps the session alive across client disconnects, so the iframe can
// attach to it later with the right working directory. Throws if the socket
// never appears so callers can return a proper error instead of registering a
// fake "live" session whose iframe will render black.
const spawnNamedSession = async (id: string, cwd: string): Promise<void> => {
	if (await zellijSessionExists(id)) return;

	const spawnOrThrow = (): ReturnType<typeof Bun.spawn> => {
		try {
			return Bun.spawn(["zellij", "--session", id], {
				cwd,
				env: { ...process.env, ZELLIJ_SOCKET_DIR },
				terminal: {
					cols: 80,
					rows: 24,
					data: () => {
						/* discard zellij's TUI output */
					},
				},
				stderr: "pipe",
			});
		} catch (err) {
			throw new Error(`Bun.spawn(zellij --session ${id}) at cwd=${cwd} failed: ${String(err)}`);
		}
	};
	const proc = spawnOrThrow();

	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 100));
		if (await zellijSessionExists(id)) {
			proc.kill();
			await proc.exited.catch(() => undefined);
			return;
		}
	}

	const stderrSnippet =
		proc.stderr instanceof ReadableStream
			? await new Response(proc.stderr).text().catch(() => "")
			: "";
	proc.kill();
	await proc.exited.catch(() => undefined);
	throw new Error(
		`zellij --session ${id} did not create a socket within 3s at cwd=${cwd}. stderr: ${stderrSnippet.slice(0, 500) || "(empty)"}`,
	);
};

export const resolveProjectCwd = async (
	projectsRoot: string,
	projectId: string,
): Promise<string> => {
	// Always use projectsRoot/projectId as the cwd, regardless of whether the
	// directory exists on disk. The user expects a new session to open directly
	// in their project folder (e.g. ~/Github/pier), not in the parent ~/Github.
	return join(projectsRoot, projectId);
};

export const makeTerminalSessionsLive = (): Layer.Layer<TerminalSessions, never, ConfigService> =>
	Layer.effect(
		TerminalSessions,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			const registryPath = join(config.piRoot, "sessions.jsonl");
			// URLs point at pier's own /zellij/* reverse proxy, not directly at
			// the zellij web server — the proxy strips X-Frame-Options and
			// handles auth so the iframe loads transparently. Path-only so it
			// resolves against whichever origin served the dashboard (loopback
			// in dev, tunnel host in remote-access setups).
			const proxyBase = "/zellij";
			const registry = new Map<SessionId, Session>();

			yield* Effect.tryPromise(async () => {
				const data = await readFile(registryPath, "utf8");
				for (const line of data.trim().split("\n").filter(Boolean)) {
					const sess = JSON.parse(line) as Session;
					// Recompute URL on load — older entries may point at the now-bypassed
					// zellij web URL, but the URL is derived from id and the proxy base.
					sess.url = `${proxyBase}/${encodeURIComponent(sess.id)}`;
					registry.set(sess.id, sess);
				}
			}).pipe(Effect.orElseSucceed(() => undefined));

			const persist = (sess: Session): Effect.Effect<void, never, never> =>
				Effect.tryPromise(async () => {
					await mkdir(join(registryPath, ".."), { recursive: true });
					await writeFile(registryPath, `${JSON.stringify(sess)}\n`, { flag: "a" });
				}).pipe(Effect.orElseSucceed(() => undefined));

			// Boot reconciliation: any "live" registry entry whose backing
			// zellij --server is gone (host reboot, zellij crash, socket wipe)
			// would otherwise be returned by open() unchanged — iframe loads
			// with no PTY behind it and renders black.
			{
				const alive = new Set(
					yield* Effect.tryPromise(() => readdir(zellijSocketDir())).pipe(
						Effect.orElseSucceed(() => [] as string[]),
					),
				);
				for (const sess of registry.values()) {
					if (sess.status === "live" && !alive.has(sess.id)) {
						sess.status = "dead";
						yield* persist(sess);
					}
				}
			}

			return {
				open: (projectId) =>
					Effect.gen(function* () {
						const id = sessionIdFromProjectId(projectId);
						const existing = registry.get(id);
						if (
							existing?.status === "live" &&
							(yield* Effect.promise(() => zellijSessionExists(id)))
						) {
							return existing;
						}

						const cwd = yield* Effect.tryPromise(() =>
							resolveProjectCwd(config.projectsRoot, projectId),
						).pipe(Effect.orElseSucceed(() => config.projectsRoot));

						yield* Effect.tryPromise({
							try: () => spawnNamedSession(id, cwd),
							catch: (cause) =>
								new TerminalError({
									message: cause instanceof Error ? cause.message : String(cause),
								}),
						}).pipe(
							Effect.tapError((err) =>
								Effect.sync(() => {
									// biome-ignore lint/suspicious/noConsole: surface real spawn failure
									console.warn(`[pier] zellij session spawn failed: ${err.message}`);
								}),
							),
						);

						const url = `${proxyBase}/${encodeURIComponent(id)}`;
						const sess: Session = {
							id,
							projectId,
							url,
							createdAt: Date.now(),
							status: "live",
						};
						registry.set(id, sess);
						yield* persist(sess);
						return sess;
					}),
				openDefault: () =>
					Effect.gen(function* () {
						const id = "default";
						const existing = registry.get(id);
						if (
							existing?.status === "live" &&
							(yield* Effect.promise(() => zellijSessionExists(id)))
						) {
							return existing;
						}

						const cwd = config.projectsRoot;

						yield* Effect.tryPromise({
							try: () => spawnNamedSession(id, cwd),
							catch: (cause) =>
								new TerminalError({
									message: cause instanceof Error ? cause.message : String(cause),
								}),
						}).pipe(
							Effect.tapError((err) =>
								Effect.sync(() => {
									// biome-ignore lint/suspicious/noConsole: surface real spawn failure
									console.warn(`[pier] zellij session spawn failed: ${err.message}`);
								}),
							),
						);

						const url = `${proxyBase}/${encodeURIComponent(id)}`;
						const sess: Session = {
							id,
							projectId: "",
							url,
							createdAt: Date.now(),
							status: "live",
						};
						registry.set(id, sess);
						yield* persist(sess);
						return sess;
					}),
				close: (id) =>
					Effect.gen(function* () {
						const sess = registry.get(id);
						if (!sess) return yield* Effect.fail(new TerminalNotFound({ id }));
						sess.status = "dead";
						registry.set(id, sess);
						yield* persist(sess);
						// Spawn `zellij delete-session --force <id>` after registry update.
						// Race with a 2000 ms timeout; swallow non-zero exits / errors via console.warn.
						yield* Effect.tryPromise({
							try: async () => {
								const proc = Bun.spawn(["zellij", "delete-session", "--force", id], {
									env: { ...process.env, ZELLIJ_SOCKET_DIR },
									stdout: "pipe",
									stderr: "pipe",
								});
								const timeoutMs = 2000;
								await Promise.race([
									proc.exited,
									new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
								]);
							},
							catch: (err) => {
								// biome-ignore lint/suspicious/noConsole: swallowed zellij delete-session error
								console.warn(`[pier] zellij delete-session failed for ${id}:`, err);
							},
						}).pipe(
							Effect.catchAll((err) =>
								Effect.sync(() => {
									// biome-ignore lint/suspicious/noConsole: swallowed zellij delete-session error
									console.warn(`[pier] zellij delete-session error for ${id}:`, err);
								}),
							),
						);
					}),
				list: () =>
					Effect.succeed(Array.from(registry.values()).filter((s) => s.status === "live")),
				get: (id) => Effect.succeed(registry.get(id) ?? null),
				health: (id) => Effect.succeed(registry.get(id)?.status === "live" || false),
				writeChars: ({ projectId, text }) =>
					Effect.tryPromise({
						try: async () => {
							const id = sessionIdFromProjectId(projectId);
							const proc = Bun.spawn(["zellij", "--session", id, "action", "write-chars", text], {
								env: { ...process.env, ZELLIJ_SOCKET_DIR },
								stdout: "pipe",
								stderr: "pipe",
							});
							const timeoutMs = 2000;
							const result = await Promise.race([
								proc.exited,
								new Promise<number>((resolve) => setTimeout(() => resolve(-1), timeoutMs)),
							]);
							if (result !== 0) {
								proc.kill();
								return { injected: false };
							}
							return { injected: true };
						},
						catch: () => ({ injected: false }),
					}).pipe(Effect.orElseSucceed(() => ({ injected: false }))),
			};
		}),
	);

export const TerminalSessionsTest: Layer.Layer<TerminalSessions> = Layer.succeed(TerminalSessions, {
	open: (projectId) =>
		Effect.succeed({
			id: sessionIdFromProjectId(projectId),
			projectId,
			url: `mem://${projectId}`,
			createdAt: Date.now(),
			status: "live",
		}),
	openDefault: () =>
		Effect.succeed({
			id: "default",
			projectId: "",
			url: "mem://default",
			createdAt: Date.now(),
			status: "live",
		}),
	close: () => Effect.void,
	list: () => Effect.succeed([]),
	get: () => Effect.succeed(null),
	health: () => Effect.succeed(false),
	writeChars: () => Effect.succeed({ injected: true }),
});
