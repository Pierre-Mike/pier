/**
 * Zellij web auth — token bootstrap + session cookie cache.
 *
 * The pier backend reverse-proxies `/zellij/*` to the local zellij web server.
 * That server requires a logged-in session cookie, obtained by POSTing a token
 * to `/command/login`. This module owns the token (auto-created on first run,
 * persisted to ~/.config/pier/zellij-token) and the resulting cookie.
 *
 * State is module-local because there is exactly one zellij web instance per
 * pier process. Concurrent callers share a single in-flight login.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_PATH = join(homedir(), ".config", "pier", "zellij-token");

let cachedToken: string | null = null;
let cachedCookie: string | null = null;
let inflightLogin: Promise<string> | null = null;

const readTokenFromDisk = async (): Promise<string | null> => {
	try {
		const raw = await readFile(TOKEN_PATH, "utf8");
		const trimmed = raw.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
};

const createTokenViaCli = async (): Promise<string> => {
	const proc = Bun.spawn(["zellij", "web", "--create-token"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	const code = await proc.exited;
	if (code !== 0) {
		const err = await new Response(proc.stderr).text();
		throw new Error(`zellij --create-token failed (${code}): ${err.trim()}`);
	}
	const match = out.match(/^token_\d+:\s*(\S+)/m);
	if (!match) throw new Error(`unrecognized zellij token output: ${out.trim()}`);
	const tokenValue = match[1];
	if (!tokenValue) throw new Error(`empty token captured from: ${out.trim()}`);
	const token = tokenValue.trim();
	await mkdir(join(TOKEN_PATH, ".."), { recursive: true });
	await writeFile(TOKEN_PATH, `${token}\n`, { mode: 0o600 });
	return token;
};

export const getZellijToken = async (): Promise<string> => {
	if (cachedToken) return cachedToken;
	cachedToken = (await readTokenFromDisk()) ?? (await createTokenViaCli());
	return cachedToken;
};

const loginToZellij = async (zellijUrl: string): Promise<string> => {
	const token = await getZellijToken();
	const res = await fetch(`${zellijUrl}/command/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ auth_token: token, remember_me: true }),
		// Bun-specific extension: trust self-signed cert on loopback.
		tls: { rejectUnauthorized: false },
	});
	if (!res.ok) {
		throw new Error(`zellij /command/login returned HTTP ${res.status}`);
	}
	const setCookie = res.headers.get("set-cookie");
	if (!setCookie) throw new Error("zellij /command/login returned no Set-Cookie");
	const firstCookie = setCookie.split(";")[0]?.trim();
	if (!firstCookie) throw new Error(`malformed Set-Cookie: ${setCookie}`);
	cachedCookie = firstCookie;
	return firstCookie;
};

export const getZellijCookie = async (zellijUrl: string, force = false): Promise<string> => {
	if (cachedCookie && !force) return cachedCookie;
	if (!inflightLogin) {
		inflightLogin = loginToZellij(zellijUrl).finally(() => {
			inflightLogin = null;
		});
	}
	return inflightLogin;
};

export const clearZellijCookie = (): void => {
	cachedCookie = null;
};

const probeZellijWeb = async (zellijUrl: string): Promise<boolean> => {
	try {
		const res = await fetch(zellijUrl, {
			tls: { rejectUnauthorized: false },
			signal: AbortSignal.timeout(1500),
		});
		return res.ok || res.status < 500;
	} catch {
		return false;
	}
};

export interface EnsureZellijWebDeps {
	probe: (url: string) => Promise<boolean>;
	spawn: (url: string) => Promise<void>;
}

/** In-flight spawn promises keyed by zellijUrl — prevents double-spawn races. */
const inflightSpawn = new Map<string, Promise<void>>();

const defaultSpawn = async (zellijUrl: string): Promise<void> => {
	const proc = Bun.spawn(["zellij", "web", "-d"], { stdout: "pipe", stderr: "pipe" });
	await proc.exited;
	for (let i = 0; i < 12; i++) {
		if (await probeZellijWeb(zellijUrl)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`zellij web did not become reachable at ${zellijUrl}`);
};

/**
 * Ensure the local zellij web server is listening. Spawns `zellij web -d` if
 * not, then polls until reachable. Idempotent: returns immediately if already
 * up. Throws if the daemon fails to come online within ~6 seconds.
 *
 * Accepts optional `deps` for testing: `{ probe, spawn }` replaces the real
 * network probe and process spawn respectively.
 */
export const ensureZellijWeb = async (
	zellijUrl: string,
	deps?: EnsureZellijWebDeps,
): Promise<void> => {
	const probeFn = deps?.probe ?? probeZellijWeb;
	const spawnFn = deps?.spawn ?? defaultSpawn;

	if (await probeFn(zellijUrl)) return;

	// Coalesce concurrent callers onto a single in-flight spawn promise.
	const existing = inflightSpawn.get(zellijUrl);
	if (existing !== undefined) {
		await existing;
		return;
	}

	const p = spawnFn(zellijUrl).finally(() => {
		inflightSpawn.delete(zellijUrl);
	});
	inflightSpawn.set(zellijUrl, p);
	await p;
};

/** Test-only: reset module state between tests. */
export const __resetZellijAuthForTests = (): void => {
	cachedToken = null;
	cachedCookie = null;
	inflightLogin = null;
};
