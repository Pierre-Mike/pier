import { expect, test } from "bun:test";
import { classify, kindOf } from "./artifact-classify.ts";

test("kindOf extracts kind from classify result", () => {
	expect(kindOf("file.md")).toBe("markdown");
	expect(kindOf("diagram.mmd")).toBe("mermaid");
	expect(kindOf("photo.png")).toBe("image");
	expect(kindOf("icon.svg")).toBe("svg");
	expect(kindOf("doc.pdf")).toBe("pdf");
	expect(kindOf("song.mp3")).toBe("audio");
	expect(kindOf("clip.mp4")).toBe("video");
	expect(kindOf("page.html")).toBe("html");
	expect(kindOf("data.json")).toBe("json");
	expect(kindOf("chart.vega")).toBe("vega");
	expect(kindOf("readme.txt")).toBe("text");
	expect(kindOf("unknown.xyz")).toBe("binary");
});

test("classify re-export works identically to blob-classify", () => {
	const result = classify("test.md");
	expect(result).toEqual({ kind: "markdown", mime: "text/markdown; charset=utf-8" });
});
