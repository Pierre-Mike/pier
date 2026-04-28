import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface PiApi {
	on(
		eventName: string,
		handler: (
			event: PiEvent,
			ctx: PiContext,
		) => Promise<PiEventResult | undefined> | PiEventResult | undefined,
	): void;
	exec?(
		command: string,
		args: readonly string[],
		options?: { readonly timeout?: number },
	): Promise<{ readonly code: number }>;
}

export interface PiContext {
	readonly cwd: string;
	readonly hasUI?: boolean;
	readonly ui?: {
		readonly notify?: (message: string, level: "info" | "warning" | "error") => void;
	};
}

export interface PiEvent {
	readonly toolName?: string;
	readonly tool_name?: string;
	readonly input?: Record<string, unknown>;
	readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
	readonly details?: Record<string, unknown>;
	readonly isError?: boolean;
}

export type PiEventResult =
	| { readonly block: true; readonly reason: string }
	| {
			readonly content?: PiEvent["content"];
			readonly details?: Record<string, unknown>;
			readonly isError?: boolean;
	  };

interface ToolCallInfo {
	readonly toolName: string;
	readonly filePath?: string;
	readonly command?: string;
}

export interface BlockDecision {
	readonly block: boolean;
	readonly reason?: string;
	readonly filePath?: string;
}

const DANGEROUS_BASH_PATTERNS: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly reason: string;
}> = [
	{ pattern: /--no-verify/, reason: "Commands using --no-verify are blocked." },
	{ pattern: /git\s+push\b.*--force/, reason: "Force pushes are blocked." },
	{
		pattern: /git\s+push\b.*origin\s+main\b/,
		reason: "Pushing directly to origin main is blocked.",
	},
	{ pattern: /^\s*rm\s+-rf\b/, reason: "rm -rf is blocked." },
	{ pattern: /git\s+reset\s+--hard/, reason: "git reset --hard is blocked." },
	{ pattern: /gh\s+repo\s+delete\b/, reason: "Deleting GitHub repositories is blocked." },
	{ pattern: /find\s+.+\s+-delete\b/, reason: "find -delete is blocked." },
];

function maybeString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export function readToolCallInfo(event: PiEvent): ToolCallInfo {
	const input = event.input ?? {};
	return {
		toolName: event.toolName ?? event.tool_name ?? "unknown",
		filePath: maybeString(input.file_path) ?? maybeString(input.path),
		command: maybeString(input.command),
	};
}

function repoRootFromPath(cwd: string, filePath: string): string {
	let dir = dirname(isAbsolute(filePath) ? filePath : resolve(cwd, filePath));
	while (true) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return cwd;
		dir = parent;
	}
}

function relativeToRoot(repoRoot: string, filePath: string): string {
	const absolute = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
	return absolute.startsWith(`${repoRoot}/`) ? absolute.slice(repoRoot.length + 1) : filePath;
}

function parseGatePaths(proposalBody: string): readonly string[] {
	const singleMatch = proposalBody.match(/^gate:\s*(.+)$/m);
	if (singleMatch?.[1]) {
		const value = singleMatch[1].trim();
		if (value.length > 0 && !value.startsWith("-")) return [value];
	}
	const multiMatch = proposalBody.match(/^gate:\s*\n((?:\s+-\s+.+\n?(?:\s+level:\s+.+\n?)?)*)/m);
	if (!multiMatch?.[1]) return [];
	const paths: string[] = [];
	for (const line of multiMatch[1].split("\n")) {
		const dashMatch = line.match(/^\s*-\s+(?:path:\s*)?(.+)$/);
		if (!dashMatch?.[1]) continue;
		const value = dashMatch[1].trim();
		if (value.length > 0 && !value.startsWith("level:")) paths.push(value);
	}
	return paths;
}

export function activeSpecTargetsFile(cwd: string, targetPath: string): boolean {
	const repoRoot = repoRootFromPath(cwd, targetPath);
	const activeDir = join(repoRoot, "specs", "active");
	if (!existsSync(activeDir)) return false;
	const rel = relativeToRoot(repoRoot, targetPath);
	for (const slug of readdirSync(activeDir)) {
		if (slug.startsWith("_") || slug.startsWith(".")) continue;
		const proposal = join(activeDir, slug, "proposal.md");
		if (!existsSync(proposal)) continue;
		const body = readFileSync(proposal, "utf-8");
		if (body.includes(targetPath) || body.includes(rel)) return true;
	}
	return false;
}

export function findFrozenGateForPath(
	cwd: string,
	filePath: string,
): { readonly slug: string; readonly gatePath: string } | null {
	const repoRoot = repoRootFromPath(cwd, filePath);
	const activeDir = join(repoRoot, "specs", "active");
	if (!existsSync(activeDir)) return null;
	const rel = relativeToRoot(repoRoot, filePath);
	for (const slug of readdirSync(activeDir)) {
		if (slug.startsWith("_") || slug.startsWith(".")) continue;
		const specDir = join(activeDir, slug);
		const proposal = join(specDir, "proposal.md");
		if (!existsSync(proposal) || !existsSync(join(specDir, ".gate-frozen"))) continue;
		const body = readFileSync(proposal, "utf-8");
		for (const gatePath of parseGatePaths(body)) {
			if (gatePath === rel || gatePath === filePath) return { slug, gatePath };
		}
	}
	return null;
}

function decideBashCall(info: ToolCallInfo): BlockDecision {
	if (info.toolName !== "bash" || !info.command) return { block: false };
	for (const rule of DANGEROUS_BASH_PATTERNS) {
		if (rule.pattern.test(info.command)) return { block: true, reason: rule.reason };
	}
	return { block: false };
}

function decidePathCall(cwd: string, filePath: string): BlockDecision {
	const frozen = findFrozenGateForPath(cwd, filePath);
	if (frozen) {
		return {
			block: true,
			filePath,
			reason: `spec ${frozen.slug} gate is frozen; edits to ${frozen.gatePath} are not allowed until the spec is archived or specs/active/${frozen.slug}/.gate-frozen is manually removed.`,
		};
	}
	if (
		filePath.includes("/packages/api-contract/") ||
		filePath.startsWith("packages/api-contract/")
	) {
		return {
			block: true,
			filePath,
			reason:
				"packages/api-contract is auto-derived from backend AppType — never edit it manually. Change the backend routes instead.",
		};
	}
	if (filePath.includes("/specs/archive/") || filePath.startsWith("specs/archive/")) {
		return {
			block: true,
			filePath,
			reason: "Archived specs are immutable. Create a new spec that supersedes the previous one.",
		};
	}
	if (filePath.endsWith("apps/backend/wrangler.toml") || filePath.endsWith("/wrangler.toml")) {
		if (!activeSpecTargetsFile(cwd, "apps/backend/wrangler.toml")) {
			return {
				block: true,
				filePath,
				reason:
					"apps/backend/wrangler.toml is a protected file. Create an active spec that targets it before editing.",
			};
		}
	}
	return { block: false };
}

export function decideToolCall(cwd: string, info: ToolCallInfo): BlockDecision {
	const bashDecision = decideBashCall(info);
	if (bashDecision.block) return bashDecision;
	return info.filePath ? decidePathCall(cwd, info.filePath) : { block: false };
}

export function traceToolEvent(params: {
	readonly cwd: string;
	readonly sessionId: string;
	readonly event: string;
	readonly tool: string;
	readonly file?: string;
	readonly reason?: string;
	readonly status?: "ok" | "error" | "blocked";
}): void {
	const dir = join(params.cwd, ".claude", "traces");
	mkdirSync(dir, { recursive: true });
	const line = JSON.stringify({
		ts: new Date().toISOString(),
		session_id: params.sessionId,
		event: params.event,
		status: params.status,
		tool: params.tool,
		file: params.file,
		reason: params.reason,
	});
	appendFileSync(join(dir, `${params.sessionId}.jsonl`), `${line}\n`);
}

export function postWriteMessages(filePath: string): readonly string[] {
	const messages: string[] = [];
	if (
		(filePath.includes("/apps/") || filePath.includes("/packages/")) &&
		filePath.endsWith(".ts") &&
		!filePath.endsWith(".d.ts")
	) {
		if (filePath.endsWith(".test.ts")) {
			const src = filePath.replace(/\.test\.ts$/, ".ts");
			if (!existsSync(src)) messages.push(`Orphaned test: no matching source file for ${filePath}`);
		} else {
			const testFile = filePath.replace(/\.ts$/, ".test.ts");
			if (!existsSync(testFile)) messages.push(`Note: ${filePath} has no colocated test file`);
		}
	}
	return messages;
}

export default function claudeHooksCompat(pi: PiApi): void {
	pi.on("tool_call", async (event, ctx) => {
		const info = readToolCallInfo(event);
		const decision = decideToolCall(ctx.cwd, info);
		if (!decision.block) {
			traceToolEvent({
				cwd: ctx.cwd,
				sessionId: "pi",
				event: "PreToolUse",
				tool: info.toolName,
				file: info.filePath,
			});
			return undefined;
		}
		traceToolEvent({
			cwd: ctx.cwd,
			sessionId: "pi",
			event: "ToolBlocked",
			tool: info.toolName,
			file: decision.filePath,
			reason: decision.reason,
			status: "blocked",
		});
		return {
			block: true,
			reason: decision.reason ?? "Blocked by Claude hook compatibility policy",
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		const info = readToolCallInfo(event);
		if (!info.filePath) return undefined;
		for (const message of postWriteMessages(info.filePath)) {
			ctx.ui?.notify?.(message, "warning");
		}
		traceToolEvent({
			cwd: ctx.cwd,
			sessionId: "pi",
			event: "PostToolUse",
			tool: info.toolName,
			file: info.filePath,
			status: event.isError ? "error" : "ok",
		});
		return undefined;
	});
}
