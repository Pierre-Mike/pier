import { expect, test } from "bun:test";
import { type ArtifactKind, classify, EXT_TO_MIME } from "./artifacts.blob-classify.core.ts";

test("classify recognizes markdown", () => {
	expect(classify("foo.md")).toEqual({ kind: "markdown", mime: "text/markdown; charset=utf-8" });
	expect(classify("bar.markdown")).toEqual({
		kind: "markdown",
		mime: "text/markdown; charset=utf-8",
	});
});

test("classify recognizes mermaid", () => {
	expect(classify("diagram.mmd")).toEqual({ kind: "mermaid", mime: "text/plain; charset=utf-8" });
	expect(classify("flow.mermaid")).toEqual({
		kind: "mermaid",
		mime: "text/plain; charset=utf-8",
	});
});

test("classify recognizes images", () => {
	expect(classify("pic.png")).toEqual({ kind: "image", mime: "image/png" });
	expect(classify("photo.jpg")).toEqual({ kind: "image", mime: "image/jpeg" });
	expect(classify("photo.jpeg")).toEqual({ kind: "image", mime: "image/jpeg" });
	expect(classify("anim.gif")).toEqual({ kind: "image", mime: "image/gif" });
	expect(classify("modern.webp")).toEqual({ kind: "image", mime: "image/webp" });
});

test("classify recognizes svg", () => {
	expect(classify("icon.svg")).toEqual({ kind: "svg", mime: "image/svg+xml" });
});

test("classify recognizes pdf", () => {
	expect(classify("doc.pdf")).toEqual({ kind: "pdf", mime: "application/pdf" });
});

test("classify recognizes audio", () => {
	expect(classify("song.mp3")).toEqual({ kind: "audio", mime: "audio/mpeg" });
	expect(classify("sample.wav")).toEqual({ kind: "audio", mime: "audio/wav" });
	expect(classify("stream.ogg")).toEqual({ kind: "audio", mime: "audio/ogg" });
});

test("classify recognizes video", () => {
	expect(classify("clip.mp4")).toEqual({ kind: "video", mime: "video/mp4" });
	expect(classify("web.webm")).toEqual({ kind: "video", mime: "video/webm" });
	expect(classify("qt.mov")).toEqual({ kind: "video", mime: "video/quicktime" });
});

test("classify recognizes html", () => {
	expect(classify("page.html")).toEqual({ kind: "html", mime: "text/html; charset=utf-8" });
	expect(classify("old.htm")).toEqual({ kind: "html", mime: "text/html; charset=utf-8" });
});

test("classify recognizes json and vega", () => {
	expect(classify("data.json")).toEqual({ kind: "json", mime: "application/json; charset=utf-8" });
	expect(classify("chart.vega")).toEqual({ kind: "vega", mime: "application/json; charset=utf-8" });
});

test("classify recognizes text", () => {
	expect(classify("readme.txt")).toEqual({ kind: "text", mime: "text/plain; charset=utf-8" });
	expect(classify("server.log")).toEqual({ kind: "text", mime: "text/plain; charset=utf-8" });
});

test("classify returns binary for unknown extension", () => {
	expect(classify("file.xyz")).toEqual({ kind: "binary", mime: "application/octet-stream" });
	expect(classify("unknown.foo")).toEqual({ kind: "binary", mime: "application/octet-stream" });
});

test("classify returns binary for no extension", () => {
	expect(classify("Makefile")).toEqual({ kind: "binary", mime: "application/octet-stream" });
	expect(classify("README")).toEqual({ kind: "binary", mime: "application/octet-stream" });
});

test("classify is case-insensitive", () => {
	expect(classify("FILE.MD")).toEqual({ kind: "markdown", mime: "text/markdown; charset=utf-8" });
	expect(classify("PHOTO.PNG")).toEqual({ kind: "image", mime: "image/png" });
	expect(classify("MiXeD.JpEg")).toEqual({ kind: "image", mime: "image/jpeg" });
});

test("classify handles paths with multiple dots", () => {
	expect(classify("archive.tar.gz")).toEqual({ kind: "binary", mime: "application/octet-stream" });
	expect(classify("config.test.json")).toEqual({
		kind: "json",
		mime: "application/json; charset=utf-8",
	});
	expect(classify("my.file.with.dots.md")).toEqual({
		kind: "markdown",
		mime: "text/markdown; charset=utf-8",
	});
});

test("EXT_TO_MIME covers all ArtifactKind variants", () => {
	const kinds = new Set<ArtifactKind>();
	for (const { kind } of Object.values(EXT_TO_MIME)) {
		kinds.add(kind);
	}
	const expected: ArtifactKind[] = [
		"markdown",
		"mermaid",
		"image",
		"svg",
		"pdf",
		"audio",
		"video",
		"html",
		"json",
		"vega",
		"text",
	];
	for (const k of expected) {
		expect(kinds.has(k)).toBe(true);
	}
});
