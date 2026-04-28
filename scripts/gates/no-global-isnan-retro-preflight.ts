import { readFileSync } from "node:fs";

const source = readFileSync("scripts/retro-preflight.ts", "utf8");

if (/[^.]\bisNaN\(commitMs\)/.test(source)) {
	throw new Error("scripts/retro-preflight.ts must not use global isNaN(commitMs)");
}

if (!source.includes("Number.isNaN(commitMs)")) {
	throw new Error("scripts/retro-preflight.ts must use Number.isNaN(commitMs)");
}
