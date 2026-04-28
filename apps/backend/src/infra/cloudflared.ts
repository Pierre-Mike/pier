/**
 * Cloudflare quick-tunnel manager.
 *
 * Owns the lifecycle of a single `cloudflared tunnel --url ...` subprocess.
 * The tunnel exposes pier publicly; while running, the manager surfaces the
 * trycloudflare hostname so security.ts can allow Host-header checks for it
 * without requiring PIGUY_ALLOWED_HOSTS to be set.
 *
 * One tunnel per pier process; concurrent start calls share the in-flight
 * launch. Stop is idempotent. The child inherits the process group, so a
 * pier crash takes the tunnel down with it.
 */
import type { Subprocess } from "bun";

export type TunnelStatus = "stopped" | "starting" | "running" | "error";

export interface TunnelState {
	readonly status: TunnelStatus;
	readonly url: string | null;
	readonly error?: string;
}

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const STARTUP_TIMEOUT_MS = 20_000;

let proc: Subprocess | null = null;
let state: TunnelState = { status: "stopped", url: null };
let inflight: Promise<TunnelState> | null = null;

export const getTunnelState = (): TunnelState => ({ ...state });

export const getDynamicAllowedHost = (): string | null => {
	if (state.status !== "running" || !state.url) return null;
	try {
		return new URL(state.url).host.toLowerCase();
	} catch {
		return null;
	}
};

const setState = (next: TunnelState): void => {
	state = next;
};

const launch = async (port: number): Promise<TunnelState> => {
	setState({ status: "starting", url: null });
	// No --http-host-header: pier's localhostGuard auto-allows the live tunnel
	// hostname via getDynamicAllowedHost(). Rewriting Host to "localhost" would
	// make pier treat tunnel traffic as loopback and re-enforce sec-fetch-site,
	// which fails for users opening the URL from another site (Gmail, Slack…).
	const child = Bun.spawn(["cloudflared", "tunnel", "--url", `http://localhost:${port}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	proc = child;

	let buffered = "";
	let resolved = false;

	const settle = (next: TunnelState): TunnelState => {
		resolved = true;
		setState(next);
		return next;
	};

	const watch = (stream: ReadableStream<Uint8Array> | null): Promise<string | null> => {
		if (!stream) return Promise.resolve(null);
		return (async () => {
			const dec = new TextDecoder();
			const reader = stream.getReader();
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) return null;
					buffered += dec.decode(value, { stream: true });
					const m = buffered.match(URL_RE);
					if (m) return m[0];
				}
			} finally {
				reader.releaseLock();
			}
		})();
	};

	// Resolve as soon as EITHER stream surfaces a URL — cloudflared logs to
	// stderr by default, so awaiting both would hang on the empty stdout.
	const urlPromise = Promise.race([watch(child.stdout), watch(child.stderr)]).then((u) => u);

	const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), STARTUP_TIMEOUT_MS));

	const exitPromise = child.exited.then(() => "EXITED" as const);

	const winner = await Promise.race([urlPromise, timeoutPromise, exitPromise]);

	if (resolved) return state;

	if (winner === "EXITED") {
		const code = await child.exited;
		proc = null;
		return settle({
			status: "error",
			url: null,
			error: `cloudflared exited (${code}) before reporting a URL`,
		});
	}
	if (!winner) {
		try {
			child.kill();
		} catch {
			/* already dead */
		}
		proc = null;
		return settle({
			status: "error",
			url: null,
			error: `timed out waiting for tunnel URL after ${STARTUP_TIMEOUT_MS}ms`,
		});
	}

	// Background-monitor for unexpected exit.
	void child.exited.then(() => {
		if (proc === child) {
			proc = null;
			if (state.status === "running") {
				setState({ status: "stopped", url: null });
			}
		}
	});

	return settle({ status: "running", url: winner });
};

export const startTunnel = async (port: number): Promise<TunnelState> => {
	if (state.status === "running") return state;
	if (inflight) return inflight;
	inflight = launch(port).finally(() => {
		inflight = null;
	});
	return inflight;
};

export const stopTunnel = async (): Promise<TunnelState> => {
	const child = proc;
	if (!child) {
		setState({ status: "stopped", url: null });
		return state;
	}
	try {
		child.kill();
	} catch {
		/* already dead */
	}
	await child.exited.catch(() => undefined);
	proc = null;
	setState({ status: "stopped", url: null });
	return state;
};

export const __resetTunnelForTests = (): void => {
	proc = null;
	state = { status: "stopped", url: null };
	inflight = null;
};
