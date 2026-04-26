/**
 * Gate for kind:writeup — verifies the markdown file exists and contains required sections.
 * Required sections are declared in the writeup's own frontmatter as `required_sections: []`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const DEFAULT_REQUIRED = ["Intent"];

export async function checkWriteup(paths: string[]): Promise<{ pass: boolean; message: string }> {
	for (const path of paths) {
		const abs = join(process.cwd(), path);
		if (!existsSync(abs)) {
			return { pass: false, message: `writeup missing at ${path}` };
		}
		const raw = readFileSync(abs, "utf-8");
		const parsed = matter(raw);
		const required = (parsed.data.required_sections as string[] | undefined) ?? DEFAULT_REQUIRED;
		for (const section of required) {
			const headingRe = new RegExp(`^#{1,6}\\s+${section}\\s*$`, "mi");
			if (!headingRe.test(parsed.content)) {
				return { pass: false, message: `${path} missing required section '${section}'` };
			}
		}
	}
	return { pass: true, message: `${paths.length} writeup(s) valid` };
}
