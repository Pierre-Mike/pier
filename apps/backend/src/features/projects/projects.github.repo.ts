import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import { ConfigService } from "../../platform/config.repo.ts";

const exec = promisify(execFile);

export interface GithubUrlService {
	readonly resolve: (projectId: string) => Effect.Effect<string | null, never, never>;
}

export const GithubUrlService = Context.GenericTag<GithubUrlService>("GithubUrlService");

const GITHUB_REMOTE_PATTERNS: readonly RegExp[] = [
	/^git@github\.com:([^/\s]+)\/([^/\s]+?)\/?$/,
	/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/,
	/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/,
];

const stripDotGit = (s: string): string => (s.endsWith(".git") ? s.slice(0, -4) : s);

/**
 * Pure normalizer — maps a `git remote get-url origin` output to a canonical
 * `https://github.com/<owner>/<repo>` URL, or null if the remote is not GitHub.
 *
 * Accepted forms:
 *   git@github.com:owner/repo(.git)?
 *   https://github.com/owner/repo(.git)?
 *   ssh://git@github.com/owner/repo(.git)?
 */
export const normalizeGithubRemote = (raw: string): string | null => {
	const url = raw.trim();
	if (!url) return null;
	for (const re of GITHUB_REMOTE_PATTERNS) {
		const m = url.match(re);
		if (!m) continue;
		const owner = m[1];
		const repo = stripDotGit(m[2] ?? "");
		if (!owner || !repo) return null;
		return `https://github.com/${owner}/${repo}`;
	}
	return null;
};

const isSafeId = (id: string): boolean =>
	id.length > 0 && !id.includes("..") && !id.includes("/") && !id.startsWith(".");

export const makeGithubUrlServiceLive = (): Layer.Layer<GithubUrlService, never, ConfigService> =>
	Layer.effect(
		GithubUrlService,
		Effect.gen(function* () {
			const cfg = yield* ConfigService;
			const config = yield* cfg.get();
			return {
				resolve: (projectId) =>
					Effect.tryPromise(async () => {
						if (!isSafeId(projectId)) return null;
						const path = join(config.projectsRoot, projectId);
						const { stdout } = await exec("git", ["-C", path, "remote", "get-url", "origin"], {
							maxBuffer: 1024 * 1024,
						});
						return normalizeGithubRemote(stdout);
					}).pipe(Effect.orElseSucceed(() => null)),
			};
		}),
	);

export const makeGithubUrlServiceTest = (
	urls: ReadonlyMap<string, string | null>,
): Layer.Layer<GithubUrlService> =>
	Layer.succeed(GithubUrlService, {
		resolve: (projectId) => Effect.succeed(urls.get(projectId) ?? null),
	});
