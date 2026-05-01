import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decideToolCall, postWriteMessages } from "./claude-hooks-compat.ts";

function makeRepo(): string {
	const cwd = join(import.meta.dir, ".tmp", crypto.randomUUID());
	mkdirSync(join(cwd, ".git"), { recursive: true });
	mkdirSync(join(cwd, "specs", "active"), { recursive: true });
	return cwd;
}

describe("decideToolCall", () => {
	it("blocks dangerous bash commands from Claude deny list", () => {
		const cwd = makeRepo();
		expect(
			decideToolCall(cwd, { toolName: "bash", command: "git reset --hard HEAD" }),
		).toMatchObject({ block: true });
		expect(
			decideToolCall(cwd, { toolName: "bash", command: "git push origin main" }),
		).toMatchObject({ block: true });
		expect(decideToolCall(cwd, { toolName: "bash", command: "bun test" })).toEqual({
			block: false,
		});
	});

	it("blocks edits to archived spec paths", () => {
		const cwd = makeRepo();
		expect(
			decideToolCall(cwd, {
				toolName: "edit",
				filePath: "specs/archive/2026-04-28-old/proposal.md",
			}),
		).toMatchObject({ block: true });
	});

	it("requires an active spec before editing backend wrangler config", () => {
		const cwd = makeRepo();
		expect(
			decideToolCall(cwd, { toolName: "write", filePath: "apps/backend/wrangler.toml" }),
		).toMatchObject({ block: true });

		const specDir = join(cwd, "specs", "active", "999-wrangler");
		mkdirSync(specDir, { recursive: true });
		writeFileSync(join(specDir, "proposal.md"), "---\ngate: apps/backend/wrangler.toml\n---\n");

		expect(
			decideToolCall(cwd, { toolName: "write", filePath: "apps/backend/wrangler.toml" }),
		).toEqual({ block: false });
	});

	it("blocks edits to a frozen active spec gate", () => {
		const cwd = makeRepo();
		const specDir = join(cwd, "specs", "active", "123-example");
		mkdirSync(specDir, { recursive: true });
		writeFileSync(
			join(specDir, "proposal.md"),
			"---\ngate:\n  - path: tests/gate.test.ts\n    level: unit\n---\n",
		);
		writeFileSync(join(specDir, ".gate-frozen"), "");

		expect(decideToolCall(cwd, { toolName: "edit", filePath: "tests/gate.test.ts" })).toMatchObject(
			{ block: true },
		);
	});
});

describe("postWriteMessages", () => {
	it("warns about missing colocated test files", () => {
		const cwd = makeRepo();
		const src = join(cwd, "apps", "backend", "src", "feature.ts");
		mkdirSync(join(cwd, "apps", "backend", "src"), { recursive: true });
		writeFileSync(src, "export const feature = true;\n");

		expect(postWriteMessages(src)).toEqual([`Note: ${src} has no colocated test file`]);
	});
});
