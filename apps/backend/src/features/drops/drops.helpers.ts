import { access } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export const MAX_DROP_BYTES = 100 * 1024 * 1024;

const stripControlBytes = (s: string): string => {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) >= 0x20) out += s[i];
	}
	return out;
};

export const sanitizeDropName = (raw: string): string => {
	const stripped = basename(stripControlBytes(raw)).replace(/[/\\]/g, "_");
	let n = stripped;
	if (!n || n === "." || n === "..") n = "unnamed";
	if (n.length > 180) {
		const ext = extname(n);
		n = n.slice(0, 180 - ext.length) + ext;
	}
	return n;
};

export const uniqueDropPath = async (dir: string, name: string): Promise<string> => {
	const candidate = join(dir, name);
	try {
		await access(candidate);
	} catch {
		return candidate;
	}
	const ext = extname(name);
	const stem = ext ? name.slice(0, -ext.length) : name;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return join(dir, `${stem}-${stamp}${ext}`);
};
