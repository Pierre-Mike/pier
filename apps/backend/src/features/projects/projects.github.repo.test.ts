import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
	GithubUrlService,
	makeGithubUrlServiceTest,
	normalizeGithubRemote,
} from "./projects.github.repo.ts";

describe("normalizeGithubRemote", () => {
	it("normalizes SSH form with .git suffix", () => {
		expect(normalizeGithubRemote("git@github.com:owner/repo.git")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("normalizes SSH form without .git suffix", () => {
		expect(normalizeGithubRemote("git@github.com:owner/repo")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("normalizes HTTPS form with .git suffix", () => {
		expect(normalizeGithubRemote("https://github.com/owner/repo.git")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("passes through HTTPS form without .git suffix", () => {
		expect(normalizeGithubRemote("https://github.com/owner/repo")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("normalizes ssh:// proto form", () => {
		expect(normalizeGithubRemote("ssh://git@github.com/owner/repo.git")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("trims trailing whitespace/newlines", () => {
		expect(normalizeGithubRemote("git@github.com:owner/repo.git\n")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("returns null for non-GitHub HTTPS remote", () => {
		expect(normalizeGithubRemote("https://gitlab.com/owner/repo.git")).toBeNull();
	});

	it("returns null for non-GitHub SSH remote", () => {
		expect(normalizeGithubRemote("git@gitlab.com:owner/repo.git")).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(normalizeGithubRemote("")).toBeNull();
	});

	it("returns null for malformed remote", () => {
		expect(normalizeGithubRemote("not-a-url")).toBeNull();
	});
});

describe("GithubUrlService — Test layer", () => {
	it("returns the configured URL for a known project", async () => {
		const layer = makeGithubUrlServiceTest(new Map([["alpha", "https://github.com/owner/repo"]]));
		const program = Effect.gen(function* () {
			const svc = yield* GithubUrlService;
			return yield* svc.resolve("alpha");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toBe("https://github.com/owner/repo");
	});

	it("returns null for an unknown project", async () => {
		const layer = makeGithubUrlServiceTest(new Map());
		const program = Effect.gen(function* () {
			const svc = yield* GithubUrlService;
			return yield* svc.resolve("missing");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toBeNull();
	});

	it("returns null when the configured URL is null", async () => {
		const layer = makeGithubUrlServiceTest(new Map([["non-gh", null]]));
		const program = Effect.gen(function* () {
			const svc = yield* GithubUrlService;
			return yield* svc.resolve("non-gh");
		});
		const result = await Effect.runPromise(Effect.provide(program, layer));
		expect(result).toBeNull();
	});
});
